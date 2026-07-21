const TONES = {
  neutral: 'bg-[#F4F7F9] text-[#5A6B7A]',
  info: 'bg-[#B8E8F0] text-[#0A1628]',
  ok: 'bg-[#1A7A5E1A] text-[#1A7A5E]',
  alert: 'bg-[#E8A23D26] text-[#8A5E17]',
  critical: 'bg-[#C63B3B1A] text-[#C63B3B]',
};

export default function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
