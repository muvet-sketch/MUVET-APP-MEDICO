import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, Toggle } from '../../components/ui';
import { CORTO_TURNOS } from '../../lib/nombresModulos';

export default function NotificacionesSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [updating, setUpdating] = useState(null);

  async function handleToggle(field, value) {
    setUpdating(field);
    const { error } = await supabase.from('perfiles').update({ [field]: value }).eq('id', perfil.id);
    if (!error) await refreshPerfil();
    setUpdating(null);
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">Notificaciones</p>

      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#0A1628]">Solicitudes entrantes</p>
        <Toggle
          checked={Boolean(perfil?.notif_solicitudes)}
          disabled={updating === 'notif_solicitudes'}
          onChange={(v) => handleToggle('notif_solicitudes', v)}
          label="Notificaciones de solicitudes entrantes"
        />
      </div>

      <div className="flex items-center justify-between">
        {/* La columna sigue llamándose `notif_relevo` porque es el
            identificador interno de MUVET Turnos — ver lib/nombresModulos.js. */}
        <p className="text-[14px] text-[#0A1628]">{`Mensajes de ${CORTO_TURNOS}`}</p>
        <Toggle
          checked={Boolean(perfil?.notif_relevo)}
          disabled={updating === 'notif_relevo'}
          onChange={(v) => handleToggle('notif_relevo', v)}
          label={`Notificaciones de mensajes de ${CORTO_TURNOS}`}
        />
      </div>
    </Card>
  );
}
