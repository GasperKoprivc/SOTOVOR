import { t } from './i18n.js';
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
      <label>{t('Družinska vloga')}<select name="familyRole" defaultValue={person.familyRole}>
        {Object.entries(familyRoles).map(([value, name]) => <option key={value} value={value}>{t(name)}</option>)}
      </select></label>
      <label>{t('Razpoložljivost')}<select value={availability} onChange={event => setAvailability(event.target.value)}>
        {Object.entries(availabilityStates).map(([value, name]) => <option key={value} value={value}>{t(name)}</option>)}
      </select></label>
      {availability !== 'available' && <label>{t('Odsoten do (neobvezno)')}<input name="unavailableUntil" type="date" defaultValue={person.unavailableUntil ?? ''} /></label>}
    </div>
    <button className="soft-button" disabled={busy}>{t('Shrani vlogo in razpoložljivost')}</button>
  </form>;
}

function MemberSettings({ person, index, busy, onChange }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return <li className="member-settings">
    <div className="member-title"><Avatar name={person.name} index={index} /><div><strong>{person.name}</strong>
      <p className="muted">{person.admin ? t('Skrbnik') : person.leaveRequested ? t('Želi zapustiti prostor') : t('Član')}</p>
    </div></div>
    <MemberPlanning key={JSON.stringify([person.familyRole, person.availability, person.unavailableUntil])} {...{ person, busy, onChange }} />
    {!person.admin && <form key={JSON.stringify(person.permissions)} onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onChange(person.id, 'permissions', Object.fromEntries(Object.keys(labels).map(key => [key, form.has(key)])));
    }}>
      <div className="rights-grid">{Object.entries(labels).map(([key, label]) =>
        <label className="check-field" key={key}><input type="checkbox" name={key} defaultChecked={person.permissions[key]} />{t(label)}</label>)}</div>
      <div className="hero-actions">
        <button className="soft-button" disabled={busy}>{t('Shrani pravice')}</button>
        {person.leaveRequested && <>
          <button type="button" className="soft-button" disabled={busy} onClick={() => onChange(person.id, 'deny')}>{t('Zavrni izstop')}</button>
          <button type="button" className="primary" disabled={busy} onClick={() => onChange(person.id, 'remove')}>{t('Odobri izstop')}</button>
        </>}
        {!person.leaveRequested && <button type="button" className="danger-button text-button" disabled={busy} onClick={() => {
          if (confirmRemove) onChange(person.id, 'remove');
          else setConfirmRemove(true);
        }}>{confirmRemove ? t('Potrdi odstranitev') : t('Odstrani člana')}</button>}
        {confirmRemove && <button type="button" className="text-button" onClick={() => setConfirmRemove(false)}>{t('Prekliči')}</button>}
      </div>
    </form>}
  </li>;
}

export default function FamilySettings({ members, expectedMembers, busy, onChange, onInvite }) {
  const people = members.filter(member => !member.inactive);
  return <section className="panel family-settings">
    <div className="panel-heading">
      <div><h2>{t('Družinski člani')}</h2><p>{expectedMembers ? t('%0 od %1 načrtovanih članov', people.length, expectedMembers) : t('Aktivni člani: %0', people.length)}</p></div>
      <button className="soft-button" onClick={onInvite}>{t('Koda povabila')}</button>
    </div>
    <ul>{people.map((person, index) => <MemberSettings key={person.id} {...{ person, index, busy, onChange }} />)}</ul>
  </section>;
}
