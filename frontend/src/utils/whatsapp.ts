export function getWhatsappLink(phone: string, text?: string): string {
  const clean = phone.replace(/\D/g, '');
  const base = `https://wa.me/55${clean}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
