import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { needsReminder } from './data.js';

export default function Notifications({ tasks, memberId, today, onView }) {
  const storageKey = `sotovor-notices-${memberId}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });
  const notices = tasks.filter(task => !task.completedAt).flatMap(task => {
    if (task.assigneeId === memberId) return [
      ...(task.assignedAt ? [{ id: `${task.id}-${task.assignedAt}`, label: 'Dodeljeno tebi', filter: 'mine', task }] : []),
      ...(needsReminder(task, today) ? [{ id: `${task.id}-due-${task.dueOn}-${task.assignedAt}`, label: 'Opomnik za rok', filter: 'due', task }] : []),
    ];
    return task.coverRequestedAt && !task.assigneeId
      ? [{ id: `${task.id}-${task.coverRequestedAt}`, label: 'Išče se zamenjava', filter: 'available', task }]
      : [];
  }).filter(notice => !dismissed.includes(notice.id));

  function markRead(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the current view usable. */ }
  }

  return <details className="notifications">
    <summary className="soft-button"><Bell size={18} /> Obvestila{notices.length > 0 && <span>{notices.length}</span>}</summary>
    <div className="panel notification-panel">
      <h2>Obvestila</h2>
      {notices.length === 0 && <p className="muted">Trenutno nimaš novih obvestil.</p>}
      <ul>{notices.map(({ id, label, filter, task }) => <li key={id}>
        <button className="notification-link" onClick={event => {
          event.currentTarget.closest('details').open = false;
          onView(filter);
        }}><small>{label}</small><strong>{task.title}</strong></button>
        <button className="icon-button" aria-label={`Označi kot prebrano: ${task.title}`} onClick={() => markRead(id)}><Check size={16} /></button>
      </li>)}</ul>
    </div>
  </details>;
}
