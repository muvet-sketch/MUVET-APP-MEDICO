export default function Card({ children, className = '' }) {
  return (
    <div className={`rounded-[16px] border border-[#E1E8ED] bg-white p-4 ${className}`}>
      {children}
    </div>
  );
}
