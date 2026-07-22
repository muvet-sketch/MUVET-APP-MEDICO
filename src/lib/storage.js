import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Fase 7 (Acción 9): el bucket 'documents' pasó de público a privado (ver
// supabase/migrations/0010_fase7_hardening.sql). Antes se guardaba la URL
// pública completa (getPublicUrl) en columnas como perfiles.carne_url; ahora
// se guarda solo el path del objeto y se resuelve a una signed URL temporal
// en el momento de uso — el bucket privado ya no acepta lectura sin firma.

export async function uploadDocumento(path, file) {
  const { error } = await supabase.storage.from('documents').upload(path, file);
  if (error) throw error;
  return { path };
}

export async function getSignedDocumentUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// path puede ser un path de storage (nuevo, Fase 7) o, para compatibilidad
// con datos existentes, una URL http ya resuelta — en ese caso se usa tal
// cual sin intentar firmarla.
export function useSignedUrl(path) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return undefined;
    }
    if (/^https?:\/\//.test(path)) {
      setUrl(path);
      return undefined;
    }

    let active = true;
    getSignedDocumentUrl(path)
      .then((signedUrl) => {
        if (active) setUrl(signedUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => {
      active = false;
    };
  }, [path]);

  return url;
}
