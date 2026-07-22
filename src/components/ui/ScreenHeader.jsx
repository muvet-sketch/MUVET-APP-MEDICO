import { useNavigate } from 'react-router-dom';

export default function ScreenHeader({ title, fallbackTo = '/home' }) {
  const navigate = useNavigate();

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#E1E8ED] bg-white px-5 py-4">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Volver"
        className="text-[18px] text-[#0A1628]"
      >
        ←
      </button>
      <h1 className="text-[16px] font-semibold text-[#0A1628]">{title}</h1>
    </div>
  );
}
