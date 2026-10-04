import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/api/admin';
import type { AdminProduct, ProductDraft } from '../lib/api/adminTypes';
import { PASTA_LABEL, type PastaType } from '../lib/types';
import { compressImage, MAX_VIDEO_MB } from './image';
import { Icon } from '../components/Icon';

const EMPTY: ProductDraft = {
  slug: '', name: '', pastaType: 'ravioles', filling: '', description: '', price: 0, stock: 0, lowStockThreshold: 3, featured: false, active: true, sortOrder: 99,
};
export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function ProductEdit() {
  const { id } = useParams();
  const isNew = id === 'nuevo';
  const navigate = useNavigate();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [d, setD] = useState<ProductDraft>(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  async function load() {
    if (isNew) return;
    const list = await adminApi.listProducts();
    const p = list.find((x) => x.id === id) ?? null;
    setProduct(p);
    if (p) setD({ id: p.id, slug: p.slug, name: p.name, pastaType: p.pastaType, filling: p.filling, description: p.description, price: p.price, stock: p.stock, lowStockThreshold: p.lowStockThreshold, featured: p.featured, active: p.active, sortOrder: p.sortOrder });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [id]);

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (d.name.trim().length < 2) return setMsg({ ok: false, text: 'Poné un nombre.' });
    if (!d.filling.trim()) return setMsg({ ok: false, text: 'Contá de qué es el relleno.' });
    if (d.price <= 0) return setMsg({ ok: false, text: 'El precio tiene que ser mayor a 0.' });
    setBusy(true);
    try {
      const newId = await adminApi.saveProduct({ ...d, name: d.name.trim(), slug: d.slug || slugify(d.name) });
      setMsg({ ok: true, text: 'Guardado.' });
      if (isNew) navigate(`/admin/productos/${newId}`, { replace: true });
      else await load();
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setMsg({ ok: false, text: /duplicate|unique/i.test(m) ? 'Ya hay un producto con esa dirección (slug). Cambiala.' : m || 'No se pudo guardar.' });
    }
    setBusy(false);
  }

  async function upload(files: FileList | null) {
    if (!files || !product) return;
    for (const f of Array.from(files)) {
      try {
        if (f.type.startsWith('image/')) {
          setUploading(`Comprimiendo ${f.name}…`);
          const blob = await compressImage(f);
          setUploading(`Subiendo ${f.name} (${Math.round(blob.size / 1024)} KB)…`);
          await adminApi.uploadMedia(product.id, blob, 'photo', product.name);
        } else if (f.type === 'video/mp4' || f.type === 'video/webm') {
          if (f.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`El video pesa más de ${MAX_VIDEO_MB} MB. Recortalo o bajale la calidad.`);
          setUploading(`Subiendo video ${f.name}…`);
          await adminApi.uploadMedia(product.id, f, 'video', product.name);
        } else {
          throw new Error(`${f.name}: formato no soportado (fotos o video MP4/WebM).`);
        }
      } catch (err) {
        setMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo subir' });
      }
    }
    setUploading(null);
    await load();
  }

  if (!isNew && !product) return <p className="muted">Cargando…</p>;

  return (
    <>
      <p><Link to="/admin/productos">← Productos</Link></p>
      <h1 className="d-l">{isNew ? 'Nuevo producto' : d.name}</h1>
      <form className="adm-form" onSubmit={save}>
        <div className="adm-grid2">
          <F label="Nombre (el gusto)" id="p-name"><input id="p-name" className="input" value={d.name} onChange={(e) => { set('name', e.target.value); if (isNew) set('slug', slugify(e.target.value)); }} /></F>
          <F label="Tipo" id="p-type">
            <select id="p-type" className="input" value={d.pastaType} onChange={(e) => set('pastaType', e.target.value as PastaType)}>
              {(Object.keys(PASTA_LABEL) as PastaType[]).map((t) => <option key={t} value={t}>{PASTA_LABEL[t]}</option>)}
            </select>
          </F>
        </div>
        <F label="Relleno" id="p-fill"><input id="p-fill" className="input" value={d.filling} onChange={(e) => set('filling', e.target.value)} /></F>
        <F label="Descripción" id="p-desc"><textarea id="p-desc" className="input" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} /></F>
        <div className="adm-grid3">
          <F label="Precio por caja ($)" id="p-price"><input id="p-price" className="input" type="number" inputMode="numeric" min={0} value={d.price} onChange={(e) => set('price', Math.max(0, Math.floor(+e.target.value)))} /></F>
          <F label="Cajas en stock" id="p-stock"><input id="p-stock" className="input" type="number" inputMode="numeric" min={0} value={d.stock} onChange={(e) => set('stock', Math.max(0, Math.floor(+e.target.value)))} /></F>
          <F label="Avisar con (stock bajo)" id="p-low"><input id="p-low" className="input" type="number" inputMode="numeric" min={0} value={d.lowStockThreshold} onChange={(e) => set('lowStockThreshold', Math.max(0, Math.floor(+e.target.value)))} /></F>
        </div>
        <div className="adm-grid3">
          <F label="Orden en la tienda" id="p-order"><input id="p-order" className="input" type="number" inputMode="numeric" value={d.sortOrder} onChange={(e) => set('sortOrder', Math.floor(+e.target.value))} /></F>
          <F label="Dirección (slug)" id="p-slug"><input id="p-slug" className="input" value={d.slug} onChange={(e) => set('slug', slugify(e.target.value))} /></F>
          <div className="adm-checks">
            <label className="switch"><input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} /><span>Visible en la tienda</span></label>
            <label className="switch"><input type="checkbox" checked={d.featured} onChange={(e) => set('featured', e.target.checked)} /><span>Destacado en el inicio</span></label>
          </div>
        </div>
        <p className="small muted">Todas las cajas son de 12 unidades.</p>
        {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
        <button type="submit" className="btn btn-ink" disabled={busy}>{busy ? 'Guardando…' : isNew ? 'Crear producto' : 'Guardar cambios'}</button>
      </form>

      {product && (
        <section className="adm-media">
          <h2 className="d-m">Fotos y videos</h2>
          <p className="small muted">Las fotos se achican y pasan a WebP en tu celular antes de subir (más rápidas para tus clientes). La primera foto marcada como portada es la que se ve en el catálogo.</p>
          <label className="btn btn-yema adm-upload">
            Subir fotos o video
            <input type="file" accept="image/*,video/mp4,video/webm" multiple onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} disabled={!!uploading} />
          </label>
          {uploading && <p className="small" role="status">{uploading}</p>}
          <ul className="adm-media-grid">
            {[...product.media].sort((a, b) => a.sortOrder - b.sortOrder).map((m, i, arr) => (
              <li key={m.id} className={m.isCover ? 'cover' : ''}>
                {m.kind === 'video' ? <video src={m.url} muted playsInline preload="metadata" /> : <img src={m.url} alt={m.alt} loading="lazy" />}
                <div className="adm-media-actions">
                  {m.kind === 'photo' && (m.isCover ? <span className="label">Portada</span> : <button type="button" className="link" onClick={() => void adminApi.setCover(product.id, m.id).then(load)}>Hacer portada</button>)}
                  <span>
                    <button type="button" className="icon-btn" aria-label="Mover antes" disabled={i === 0} onClick={() => void adminApi.moveMedia(product.id, m.id, -1).then(load)}><Icon name="arriba" size={20} /></button>
                    <button type="button" className="icon-btn" aria-label="Mover después" disabled={i === arr.length - 1} onClick={() => void adminApi.moveMedia(product.id, m.id, 1).then(load)}><Icon name="abajo" size={20} /></button>
                    <button type="button" className="icon-btn" aria-label="Borrar" onClick={() => confirm('¿Borrar este archivo?') && void adminApi.deleteMedia(product.id, m.id).then(load)}><Icon name="basura" size={20} /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}
