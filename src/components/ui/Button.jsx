const VARIANTS = {
  primary: 'bg-[#0A1628] text-white active:bg-[#132339] disabled:bg-[#9AA5B1]',
  secondary: 'bg-[#1A7A5E] text-white active:bg-[#156049] disabled:bg-[#9AA5B1]',
  outline: 'bg-transparent text-[#0A1628] border border-[#0A1628] active:bg-[#F4F7F9] disabled:text-[#9AA5B1] disabled:border-[#9AA5B1]',
  ghost: 'bg-transparent text-[#0A1628] active:bg-[#F4F7F9]',
  danger: 'bg-transparent text-[#C63B3B] border border-[#C63B3B] active:bg-[#C63B3B1A] disabled:text-[#9AA5B1] disabled:border-[#9AA5B1]',
};

export default function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  fullWidth = true,
  onClick,
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${fullWidth ? 'w-full' : ''} rounded-[10px] px-4 py-3 text-[14px] font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
