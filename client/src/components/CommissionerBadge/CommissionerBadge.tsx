import SecurityIcon from '@mui/icons-material/Security';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import './CommissionerBadge.scss';

/** Small badge marking the commissioner (solid shield) or a co-commissioner
 * (outlined shield) — reused everywhere a name shows up, same as ChampionBadge. */
export function CommissionerBadge({
  role,
  size = 14,
}: {
  role: 'COMMISSIONER' | 'SUB_COMMISSIONER';
  size?: number;
}) {
  const label = role === 'COMMISSIONER' ? 'Commissioner' : 'Co-commissioner';
  return (
    <span
      className={`commissioner-badge${role === 'SUB_COMMISSIONER' ? ' commissioner-badge--sub' : ''}`}
      title={label}
      aria-label={label}
    >
      {role === 'COMMISSIONER' ? (
        <SecurityIcon sx={{ fontSize: size }} />
      ) : (
        <ShieldOutlinedIcon sx={{ fontSize: size }} />
      )}
    </span>
  );
}
