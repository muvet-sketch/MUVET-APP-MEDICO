const TONES = {
  info: 'bg-[#0A1628] text-white',
  ok: 'bg-[#1A7A5E] text-white',
  alert: 'bg-[#E8A23D] text-[#0A1628]',
  critical: 'bg-[#C63B3B] text-white',
};

export default function Toast({ message, tone = 'info', visible }) {
  if (!visible || !message) return null;
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 w-[90%] max-w-[400px] -translate-x-1/2 rounded-[10px] px-4 py-3 text-center text-[14px] shadow-lg ${TONES[tone]}`}
      role="status"
    >
      {message}
    </div>
  );
}
