import { useState } from 'react';
import { Avatar } from './Overview.jsx';
import { availabilityStates, familyRoles } from './data.js';

const labels = { create: 'Dodaja vnose', edit: 'Ureja vsebino', move: 'Premika datume', remove: 'Odstranjuje vnose' };

function MemberPlanning({ person, busy, onChange }) {
  const [availability, setAvailability] = useState(person.availability ?? 'available');
  return <form className="member-planning" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onChange(person.id, 'planning', {
      familyRole: fields.get('familyRole'), availability,
      unavailableUntil: fields.get('unavailableUntil') || null,
    });
  }}>
    <div className="planning-fields">
      <label>Družinska vloga<select name="familyRole" defaultValue={person.familyRole}>
        {Object.entries(familyRoles).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      <label>Razpoložljivost<select value={availability} onChange={event => setAvailability(event.target.value)}>
        {Object.entries(availabilityStates).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>
      {availability !== 'available' && <label>Odsoten do (neobvezno)<input name="unavailableUntil" type="date" defaultValue={person.unavailableUntil ?? ''} /></label>}
    </div>
    <button className="soft-button" disabled={busy}>Shrani vlogo in razpoložljivost</button>
  </form>;
}

function MemberSettings({ person, index, busy, onChange }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return <li className="member-settings">
    <div className="member-title"><Avatar name={person.name} index={index} /><div><strong>{person.name}</strong>
      <p className="muted">{person.admin ? 'Skrbnik' : person.leaveRequested ? 'Želi zapustiti prostor' : 'Član'}</p>
    </div></div>
    <MemberPlanning key={JSON.stringify([person.familyRole, person.availability, person.unavailableUntil])} {...{ person, busy, onChange }} />
    {!person.admin && <form key={JSON.stringify(person.permissions)} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onChange(person.id, 'permissions', Object.fromEntries(Object.keys(labels).map(key => [key, form.has(key)])));
    }}>
      <div className="rights-grid">{Object.entries(labels).map(([key, label]) =>
        <label className="check-field" key={key}><input type="checkbox" name={key} defaultChecked={person.permissions[key]} />{label}</label>)}</div>
      <div className="hero-actions">
        <button className="soft-button" disabled={busy}>Shrani pravice</button>
        {person.leaveRequested && <>
          <button type="button" className="soft-button" disabled={busy} onClick={() => onChange(person.id, 'deny')}>Zavrni izstop</button>
          <button type="button" className="primary" disabled={busy} onClick={() => onChange(person.id, 'remove')}>Odobri izstop</button>
        </>}
        {!person.leaveRequested && <button type="button" className="danger-button text-button" disabled={busy} onClick={() => {
          if (confirmRemove) onChange(person.id, 'remove');
          else setConfirmRemove(true);
        }}>{confirmRemove ? 'Potrdi odstranitev' : 'Odstrani člana'}</button>}
        {confirmRemove && <button type="button" className="text-button" onClick={() => setConfirmRemove(false)}>Prekliči</button>}
      </div>
    </form>}
  </li>;
}

export default function FamilySettings({ members, expectedMembers, busy, onChange, onInvite }) {
  const people = members.filter(member => !member.inactive);
  return <section className="panel family-settings">
    <div className="panel-heading">
      <div><h2>Družinski člani</h2><p>{people.length}{expectedMembers ? ` od ${expectedMembers} načrtovanih članov` : ' aktivnih članov'}</p></div>
      <button className="soft-button" onClick={onInvite}>Koda povabila</button>
    </div>
    <ul>{people.map((person, index) => <MemberSettings key={person.id} {...{ person, index, busy, onChange }} />)}</ul>
  </section>;
}
