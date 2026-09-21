import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CategoryTabs } from '../menu/CategoryTabs';
import { MenuItemCard } from '../menu/MenuItemCard';
import { ItemCustomizationModal, type CustomizedItemResult } from '../menu/ItemCustomizationModal';
import { NeighborhoodPicker, OUTRO_BAIRRO } from './NeighborhoodPicker';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { api } from '../../services/api';
import { formatMoney, toCents } from '../../utils/money';
import { maskPhone } from '../../utils/phoneMask';
import type { Category, MenuItem, OrderType, PaymentMethod } from '../../types';

interface WizardItem extends CustomizedItemResult {
  wizardItemId: string;
}

const NEEDS_MODAL_CATEGORIES: Category[] = ['HOT_DOGS', 'HAMBURGUERES', 'MACARRAO_NA_CHAPA'];

interface OrderWizardProps {
  open: boolean;
  onClose: () => void;
}

export function OrderWizard({ open, onClose }: OrderWizardProps) {
  const config = useCatalogStore((s) => s.config);
  const menuItems = useCatalogStore((s) => s.menuItems);
  const neighborhoods = useCatalogStore((s) => s.neighborhoods);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<OrderType>('MESA');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [customNeighborhoodName, setCustomNeighborhoodName] = useState('');
  const [customDeliveryFee, setCustomDeliveryFee] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [cashPaidAmount, setCashPaidAmount] = useState('');
  const [items, setItems] = useState<WizardItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>('HOT_DOGS');
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const extrasOptions = menuItems.filter((i) => i.category === 'ACRESCIMOS' && i.available);
  const visibleItems = menuItems.filter((i) => i.category === activeCategory);
  const isOutro = neighborhoodId === OUTRO_BAIRRO;
  const selectedNeighborhood = neighborhoods.find((n) => String(n.id) === neighborhoodId);
  // Fase 12 -- pedido interno pode usar bairro fora da lista, com taxa digitada
  // na hora. O cardápio público não tem esses dois campos (isOutro lá só mostra
  // o aviso de "ligue para confirmar", sem envio possível).
  const deliveryFeeCents = isOutro
    ? toCents(customDeliveryFee || '0')
    : selectedNeighborhood
      ? toCents(selectedNeighborhood.deliveryFee)
      : 0;

  const subtotalCents = items.reduce((sum, item) => {
    const extrasTotal = item.extras.reduce((s, e) => s + e.unitPriceCents * e.quantity, 0);
    return sum + (item.unitPriceCents + extrasTotal) * item.quantity;
  }, 0);
  const totalCents = subtotalCents + (type === 'DELIVERY' ? deliveryFeeCents : 0);

  // Mesa: número da mesa OU nome do cliente (pelo menos um). Se digitou
  // número, ele precisa ser válido; nome sozinho basta (cliente no balcão,
  // mesa improvisada). Mesma regra do backend (orders.service.ts).
  const tableNumberParsed = tableNumber.trim() ? parseInt(tableNumber, 10) : null;
  const tableNumberValid = tableNumberParsed !== null && tableNumberParsed >= 1 && (!config || tableNumberParsed <= config.maxTables);

  const step1Valid = (() => {
    if (type === 'MESA') {
      if (tableNumberParsed !== null && !tableNumberValid) return false;
      if (tableNumberParsed === null && !customerName.trim()) return false;
    }
    if (type === 'RETIRADA' || type === 'DELIVERY') { if (!customerName.trim() || !customerPhone.trim()) return false; }
    if (type === 'DELIVERY') {
      if (!customerAddress.trim()) return false;
      if (!neighborhoodId) return false;
      if (isOutro) {
        if (!customNeighborhoodName.trim()) return false;
        if (toCents(customDeliveryFee || '0') <= 0) return false;
      }
    }
    if (paymentMethod === 'DINHEIRO') { const cash = toCents(cashPaidAmount || '0'); if (cash < totalCents) return false; }
    return true;
  })();

  const addWizardItem = (result: CustomizedItemResult) => { setItems((prev) => [...prev, { ...result, wizardItemId: `${Date.now()}-${Math.random()}` }]); };

  const handleSelectItem = (item: MenuItem) => {
    const needsModal = item.requiredChoice !== null || NEEDS_MODAL_CATEGORIES.includes(item.category);
    if (needsModal) { setModalItem(item); } else { addWizardItem({ menuItemId: item.id, menuItemName: item.name, unitPriceCents: toCents(item.price), quantity: 1, observations: null, selectedChoice: null, extras: [] }); }
  };

  const removeItem = (wizardItemId: string) => { setItems((prev) => prev.filter((i) => i.wizardItemId !== wizardItemId)); };

  const handleClose = () => {
    setStep(1); setType('MESA'); setTableNumber(''); setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setNeighborhoodId(''); setCustomNeighborhoodName(''); setCustomDeliveryFee(''); setPaymentMethod('PIX'); setCashPaidAmount(''); setItems([]); setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: any = { type, paymentMethod, items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, observations: i.observations, selectedChoice: i.selectedChoice, extras: i.extras.map((e) => ({ menuItemId: e.menuItemId, quantity: e.quantity })) })) };
      if (type === 'MESA') {
        if (tableNumberParsed !== null) payload.tableNumber = tableNumberParsed;
        if (customerName.trim()) payload.customerName = customerName.trim();
      }
      if (type === 'RETIRADA' || type === 'DELIVERY') { payload.customerName = customerName.trim(); payload.customerPhone = customerPhone.trim(); }
      if (type === 'DELIVERY') {
        payload.customerAddress = customerAddress.trim();
        if (isOutro) {
          payload.customNeighborhoodName = customNeighborhoodName.trim();
          payload.customDeliveryFee = (toCents(customDeliveryFee) / 100).toFixed(2);
        } else {
          payload.neighborhoodId = parseInt(neighborhoodId, 10);
        }
      }
      if (paymentMethod === 'DINHEIRO') { payload.cashPaidAmount = (toCents(cashPaidAmount) / 100).toFixed(2); }
      await api.post('/orders', payload);
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar pedido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Novo Pedido — Passo ${step} de 3`}>
      <div className="flex flex-col gap-4">
        {step === 1 && (
          <>
            <div className="flex gap-2">
              {(['MESA', 'RETIRADA', 'DELIVERY'] as OrderType[]).map((t) => (<button key={t} onClick={() => setType(t)} className={`h-11 flex-1 rounded-lg text-sm font-medium ${type === t ? 'bg-primary text-white' : 'bg-bg-elevated text-white/70'}`}>{t === 'MESA' ? 'Mesa' : t === 'RETIRADA' ? 'Retirada' : 'Delivery'}</button>))}
            </div>
            {type === 'MESA' && (
              <>
                <Input label={`Número da mesa (1 a ${config?.maxTables ?? '?'})`} type="number" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} />
                <Input label="Nome do cliente (opcional se informou a mesa)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                <p className="-mt-2 text-xs text-neutral-500">Informe a mesa, o nome, ou os dois.</p>
              </>
            )}
            {(type === 'RETIRADA' || type === 'DELIVERY') && (<><Input label="Nome" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /><Input label="Telefone" value={customerPhone} onChange={(e) => setCustomerPhone(maskPhone(e.target.value))} /></>)}
            {type === 'DELIVERY' && (
              <>
                <Input label="Endereço" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                <NeighborhoodPicker value={neighborhoodId} onChange={setNeighborhoodId} contactPhone={config?.contactPhone ?? ''} />
                {isOutro && (
                  <>
                    <Input label="Nome do bairro" value={customNeighborhoodName} onChange={(e) => setCustomNeighborhoodName(e.target.value)} />
                    <Input label="Taxa de entrega" type="number" step="0.01" value={customDeliveryFee} onChange={(e) => setCustomDeliveryFee(e.target.value)} />
                  </>
                )}
              </>
            )}
            <Select label="Pagamento" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option value="PIX">Pix</option><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option><option value="DINHEIRO">Dinheiro</option>
            </Select>
            {paymentMethod === 'DINHEIRO' && (<Input label="Cliente vai pagar com quanto?" type="number" step="0.01" value={cashPaidAmount} onChange={(e) => setCashPaidAmount(e.target.value)} />)}
            <Button size="lg" disabled={!step1Valid} onClick={() => setStep(2)}>Próximo: Itens</Button>
          </>
        )}

        {step === 2 && (
          <>
            <CategoryTabs active={activeCategory} onChange={setActiveCategory} />
            <div className="grid max-h-[40vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
              {visibleItems.map((item) => (<MenuItemCard key={item.id} item={item} onSelect={handleSelectItem} />))}
            </div>
            {items.length > 0 && (
              <div className="rounded-lg bg-bg-elevated p-3">
                <p className="mb-2 text-sm font-semibold text-white">Itens no pedido ({items.length})</p>
                {items.map((item) => (<div key={item.wizardItemId} className="flex items-center justify-between py-1 text-sm text-white/80"><span>{item.menuItemName}{item.selectedChoice ? ` (${item.selectedChoice})` : ''}</span><button onClick={() => removeItem(item.wizardItemId)} className="text-xs text-red-400">Remover</button></div>))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep(1)}>Voltar</Button>
              <Button className="flex-1" disabled={items.length === 0} onClick={() => setStep(3)}>Revisar</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="max-h-[40vh] overflow-y-auto">
              {items.map((item) => { const extrasTotal = item.extras.reduce((s, e) => s + e.unitPriceCents * e.quantity, 0); const lineTotal = (item.unitPriceCents + extrasTotal) * item.quantity; return (<div key={item.wizardItemId} className="flex justify-between border-b border-white/10 py-2 text-sm"><span className="text-white">{item.menuItemName}</span><span className="text-white/80">{formatMoney(lineTotal)}</span></div>); })}
            </div>
            <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-semibold text-white"><span>Total</span><span>{formatMoney(totalCents)}</span></div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep(2)}>Voltar</Button>
              <Button className="flex-1" disabled={loading} onClick={handleSubmit}>{loading ? 'Enviando...' : 'Confirmar Pedido'}</Button>
            </div>
          </>
        )}
      </div>

      <ItemCustomizationModal item={modalItem} extrasOptions={extrasOptions} onClose={() => setModalItem(null)} onConfirm={addWizardItem} />
    </Modal>
  );
}
