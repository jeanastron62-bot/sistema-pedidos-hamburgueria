import { useCatalogStore } from '../../stores/useCatalogStore';
import { getWhatsappLink } from '../../utils/whatsapp';

export function PublicFooter() {
  const config = useCatalogStore((s) => s.config);

  if (!config) return null;

  const whatsappUrl = getWhatsappLink(config.contactPhone);

  return (
    <footer className="mt-8 flex flex-col items-center gap-2 border-t border-neutral-850 px-4 py-6 text-center text-sm text-neutral-500">
      <a href={whatsappUrl} target="_blank" rel="noreferrer" className="text-secondary">WhatsApp: {config.contactPhone}</a>
      <p>Instagram: @{config.contactInstagram}</p>
    </footer>
  );
}
