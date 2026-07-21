export default function Input({ label, error, className = '', id, ...props }) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full text-left">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E] ${error ? 'border-[#C63B3B]' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-[12px] text-[#C63B3B]">{error}</p>}
    </div>
  );
}
