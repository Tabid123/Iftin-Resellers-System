import { downloadBlobInBrowser } from './downloadFile';
import { format } from 'date-fns';

interface TransactionRow {
  id: string;
  customer_phone: string;
  receiver_phone?: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  status: string;
  delivery_status?: string;
  created_at: string;
  provider_name: string;
  cost_price: number;
  evoucher_rate: number;
}

interface ExportSummary {
  totalCount: number;
  totalSales: number;
  totalProfit: number;
  period: string;
}

const formatPrice = (n: number) => `$${n.toFixed(2)}`;

export async function exportTransactionsPDF(
  transactions: TransactionRow[],
  summary: ExportSummary
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape' });
  
  // Header
  doc.setFontSize(18);
  doc.text('Najax Data - Transactions Report', 14, 20);
  doc.setFontSize(10);
  doc.text(`Period: ${summary.period} | Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 14, 28);

  // Summary
  doc.setFontSize(12);
  doc.text(`Total Orders: ${summary.totalCount}`, 14, 38);
  doc.text(`Total Sales: ${formatPrice(summary.totalSales)}`, 14, 45);
  doc.text(`Total Profit: ${formatPrice(summary.totalProfit)}`, 14, 52);

  // Table
  autoTable(doc, {
    startY: 58,
    head: [['Date', 'Customer', 'Receiver', 'Package', 'Amount', 'Price', 'Status', 'Provider']],
    body: transactions.map(t => [
      format(new Date(t.created_at), 'MMM dd HH:mm'),
      t.customer_phone,
      t.receiver_phone || '-',
      t.package_name,
      t.data_amount,
      formatPrice(t.selling_price),
      t.delivery_status || t.status,
      t.provider_name,
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  const blob = doc.output('blob');
  await downloadBlobInBrowser(blob, `transactions_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export async function exportTransactionsExcel(
  transactions: TransactionRow[],
  summary: ExportSummary
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Najax Data - Transactions Report'],
    [`Period: ${summary.period}`],
    [`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`],
    [],
    ['Metric', 'Value'],
    ['Total Orders', summary.totalCount],
    ['Total Sales', summary.totalSales],
    ['Total Profit', summary.totalProfit],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Transactions sheet
  const txData = transactions.map(t => ({
    Date: format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
    Customer: t.customer_phone,
    Receiver: t.receiver_phone || '',
    Package: t.package_name,
    'Data Amount': t.data_amount,
    'Selling Price': t.selling_price,
    'Cost Price': t.cost_price,
    Profit: (t.selling_price * (1 + t.evoucher_rate)) - t.cost_price,
    Status: t.delivery_status || t.status,
    Provider: t.provider_name,
  }));
  const txSheet = XLSX.utils.json_to_sheet(txData);
  XLSX.utils.book_append_sheet(wb, txSheet, 'Transactions');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await downloadBlobInBrowser(blob, `transactions_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}
