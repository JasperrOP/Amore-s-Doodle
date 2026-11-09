import { NavLink } from 'react-router-dom'
const items = [['/', '🏠', 'Home'], ['/canvas', '🎨', 'Canvas'], ['/chat', '💌', 'Chat'], ['/gallery', '🖼️', 'Gallery'], ['/settings', '⚙️', 'Settings']]
export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 safe-bottom border-t" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
      <div className="flex max-w-xl mx-auto">
        {items.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex-1 flex flex-col items-center py-2 text-[11px] no-underline min-h-[52px]"
            style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--muted)', fontWeight: isActive ? 700 : 500 })}>
            <span className="text-xl leading-none">{icon}</span>{label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
