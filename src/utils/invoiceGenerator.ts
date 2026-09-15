// Helper function to load image from URL
const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

// Helper function to load local image
const loadLocalImage = (imagePath: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load local image'));
    img.src = imagePath;
  });
};

export interface InvoiceData {
  transactionId: string;
  provider: string;
  logo?: string | null;
  package: string;
  senderPhone: string;
  receiverPhone: string;
  price: string;
  dateTime: string;
  expiryDateTime?: string;
  status: string;
  delivery_status?: string;
  payment_source?: string | null;
}

// Generate beautiful invoice image
export const generateInvoiceImage = async (order: InvoiceData): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1100;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 800, 1100);
  
  // Header with gradient
  const gradient = ctx.createLinearGradient(0, 0, 800, 150);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(1, '#2563eb');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 150);
  
  // Load and draw Najax Data logo (right side of header)
  try {
    const najaxLogoModule = await import('@/assets/najax-logo.jpeg');
    const najaxLogo = await loadLocalImage(najaxLogoModule.default);
    const logoWidth = 120;
    const logoHeight = 80;
    ctx.drawImage(najaxLogo, 640, 35, logoWidth, logoHeight);
  } catch (error) {
    console.error('Error loading Najax logo:', error);
  }
  
  // Title (left side)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('INVOICE', 40, 70);
  
  // Transaction ID
  ctx.font = '18px Arial';
  ctx.fillText(`ID: ${order.transactionId}`, 40, 110);
  
  // Provider Section with Logo
  ctx.fillStyle = '#eff6ff';
  ctx.fillRect(40, 180, 720, 120);
  
  // Try to load and draw provider logo
  try {
    if (order.logo) {
      const providerLogo = await loadImageFromUrl(order.logo);
      const logoSize = 80;
      ctx.drawImage(providerLogo, 60, 200, logoSize, logoSize);
      
      // Provider text next to logo
      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 32px Arial';
      ctx.fillText(order.provider, 160, 230);
      
      ctx.fillStyle = '#2563eb';
      ctx.font = '24px Arial';
      ctx.fillText(order.package, 160, 270);
    } else {
      // No logo - just text
      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 32px Arial';
      ctx.fillText(order.provider, 60, 230);
      
      ctx.fillStyle = '#2563eb';
      ctx.font = '24px Arial';
      ctx.fillText(order.package, 60, 270);
    }
  } catch (error) {
    console.error('Error loading provider logo:', error);
    // Fallback - just text
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(order.provider, 60, 230);
    
    ctx.fillStyle = '#2563eb';
    ctx.font = '24px Arial';
    ctx.fillText(order.package, 60, 270);
  }
  
  // Details Section
  const details = [
    { label: 'Lambarka Lacagta Ka dirtay:', value: order.senderPhone },
    { label: 'Habka Lacag Bixinta:', value: 'EVC' },
    { label: 'Lambarka xirmada u rabtid:', value: order.receiverPhone },
    { label: 'Tariikhda Dalabka:', value: order.dateTime },
    ...(order.payment_source ? [{ label: 'Nooca Dalabka:', value: 
      order.payment_source === 'ussd_online' ? 'Online' :
      order.payment_source === 'sms_offline' ? 'Offline (SMS)' :
      order.payment_source === 'auto_topup' ? 'Auto Top-Up' :
      order.payment_source === 'manual' ? 'Manual' :
      order.payment_source
    }] : []),
  ];
  
  let yPos = 340;
  details.forEach(detail => {
    ctx.fillStyle = '#6b7280';
    ctx.font = '18px Arial';
    ctx.fillText(detail.label, 60, yPos);
    
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(detail.value, 500, yPos);
    
    // Line
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, yPos + 10);
    ctx.lineTo(740, yPos + 10);
    ctx.stroke();
    
    yPos += 50;
  });
  
  // Price Section
  const priceGradient = ctx.createLinearGradient(0, yPos + 20, 800, yPos + 120);
  priceGradient.addColorStop(0, '#3b82f6');
  priceGradient.addColorStop(1, '#2563eb');
  ctx.fillStyle = priceGradient;
  ctx.fillRect(40, yPos + 20, 720, 100);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Arial';
  ctx.fillText('Lacagta Guud:', 60, yPos + 70);
  
  ctx.font = 'bold 48px Arial';
  const priceWidth = ctx.measureText(order.price).width;
  ctx.fillText(order.price, 740 - priceWidth, yPos + 80);
  
  // Status Badge - Use delivery_status if available, otherwise fall back to status
  yPos += 150;
  const displayStatus = order.delivery_status || order.status;
  const statusText = displayStatus === 'delivered' ? 'Delivered ✓' : 
                     displayStatus === 'completed' ? 'Success ✓' :
                     displayStatus === 'pending' || displayStatus === 'processing' ? 'Pending ⏳' : 'Failed ✗';
  
  const isSuccess = displayStatus === 'delivered' || displayStatus === 'completed';
  const isPending = displayStatus === 'pending' || displayStatus === 'processing';
  
  ctx.fillStyle = isSuccess ? '#dcfce7' : isPending ? '#fef9c3' : '#fee2e2';
  const badgeWidth = 300;
  const badgeX = (800 - badgeWidth) / 2;
  ctx.fillRect(badgeX, yPos, badgeWidth, 60);
  
  ctx.fillStyle = isSuccess ? '#166534' : isPending ? '#854d0e' : '#991b1b';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(statusText, 400, yPos + 40);
  
  // Footer
  yPos += 100;
  ctx.fillStyle = '#6b7280';
  ctx.font = '18px Arial';
  ctx.fillText('Mahadsanid-Soo dhawow', 400, yPos);
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = '#3b82f6';
  ctx.fillText('Najax Data - Waqti kasta, Meel kasta', 400, yPos + 35);
  
  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create image'));
    }, 'image/jpeg', 0.95);
  });
};
