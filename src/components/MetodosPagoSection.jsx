import { useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, Input, Button, Toast } from './ui';
import { TIPOS_CUENTA } from '../lib/pagos';

// Datos de pago del usuario (migración 0029 · perfiles.pago_*). La usan el
// médico (N-8) y el auxiliar (perfil inline de N-28); la clínica no la lleva.
//
// Estos datos NO son públicos: solo se comparten con la contraparte de un
// servicio cuando el usuario lo decide, servicio por servicio, desde el panel
// de pago de la conversación (PanelPagoServicio). Aquí solo se configuran.
export default function MetodosPagoSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [titular, setTitular] = useState(perfil?.pago_titular ?? '');
  const [banco, setBanco] = useState(perfil?.pago_banco ?? '');
  const [tipoCuenta, setTipoCuenta] = useState(perfil?.pago_tipo_cuenta ?? '');
  const [numeroCuenta, setNumeroCuenta] = useState(perfil?.pago_numero_cuenta ?? '');
  const [llaveBreb, setLlaveBreb] = useState(perfil?.pago_llave_breb ?? '');
  const [link, setLink] = useState(perfil?.pago_link ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          pago_titular: titular.trim() || null,
          pago_banco: banco.trim() || null,
          pago_tipo_cuenta: tipoCuenta.trim() || null,
          pago_numero_cuenta: numeroCuenta.trim() || null,
          pago_llave_breb: llaveBreb.trim() || null,
          pago_link: link.trim() || null,
        })
        .eq('id', perfil.id);
      if (updateError) throw updateError;
      await refreshPerfil();
      showToast('Datos de pago actualizados.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (!perfil) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-[14px] font-semibold text-[#0A1628]">Datos de pago</p>
        <p className="mt-1 text-[12px] text-[#5A6B7A]">
          Cómo te pueden pagar los servicios de MUVET Turnos, Relevo y Auxiliar. Solo se comparten cuando tú lo decides,
          servicio por servicio.
        </p>
      </div>

      <Input label="Titular de la cuenta" value={titular} onChange={(e) => setTitular(e.target.value)} />
      <Input label="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} />

      <div className="w-full text-left">
        <label htmlFor="pago_tipo_cuenta" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
          Tipo de cuenta
        </label>
        <select
          id="pago_tipo_cuenta"
          value={tipoCuenta}
          onChange={(e) => setTipoCuenta(e.target.value)}
          className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
        >
          <option value="">Sin especificar</option>
          {TIPOS_CUENTA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Número de cuenta"
        inputMode="numeric"
        value={numeroCuenta}
        onChange={(e) => setNumeroCuenta(e.target.value)}
      />
      <Input
        label="Llave BreB"
        placeholder="Celular, correo o documento registrado en Bre-B"
        value={llaveBreb}
        onChange={(e) => setLlaveBreb(e.target.value)}
      />
      <Input
        label="Link de pago"
        type="url"
        placeholder="https://…"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button onClick={handleGuardar} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar datos de pago'}
      </Button>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
