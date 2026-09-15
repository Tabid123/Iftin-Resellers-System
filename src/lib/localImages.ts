import hormuud from '@/assets/providers/hormuud-logo.jpeg';
import somnet from '@/assets/providers/somnet-logo.png';
import somtel from '@/assets/providers/somtel-logo.jpg';
import amtel from '@/assets/providers/amtel-logo.png';
import somlink from '@/assets/providers/somlink-logo.png';
import evc from '@/assets/payment-providers/evc-plus.png';
import edahab from '@/assets/payment-providers/edahab.jpg';
import jeeb from '@/assets/payment-providers/jeeb.png';
import premier from '@/assets/payment-providers/premier.jfif';
import anfac from '@/assets/categories/anfac.png';
import anfacPlus from '@/assets/categories/anfac-plus.png';
import fiveG from '@/assets/categories/5g.png';
import fiveGPlus from '@/assets/categories/5g-plus.png';
import adslArday from '@/assets/categories/adsl-arday.png';
import adslPlus from '@/assets/categories/adsl-plus.png';
import kaarKuhadal from '@/assets/categories/kaar-kuhadal.jpg';
import mifiInternet from '@/assets/categories/mifi-internet.png';
import noExpireSomlink from '@/assets/categories/no-expire-somlink.png';
import noExpireSomtel from '@/assets/categories/no-expire-somtel.png';
import qanciyePlus from '@/assets/categories/qanciye-plus.png';
import unlimitedCallsHormuud from '@/assets/categories/unlimited-calls-hormuud.png';
import unlimitedCallsSomtel from '@/assets/categories/unlimited-calls-somtel.png';
import unlimitedDataHormuud from '@/assets/categories/unlimited-data-hormuud.png';
import unlimitedDataVoiceHormuud from '@/assets/categories/unlimited-data-voice-hormuud.png';
import unlimitedDataVoiceSomlink from '@/assets/categories/unlimited-data-voice-somlink.png';
import unlimitedDataVoiceSomlink2 from '@/assets/categories/unlimited-data-voice-somlink2.png';
import unlimitedDataVoiceSomtel from '@/assets/categories/unlimited-data-voice-somtel.png';
import unlimitedVoice from '@/assets/categories/unlimited-voice.png';
import voiceSomtel from '@/assets/categories/voice-somtel.png';
import banner1 from '@/assets/local-banners/banner1.jpeg';
import banner2 from '@/assets/local-banners/banner2.jpeg';
import banner3 from '@/assets/local-banners/banner3.png';
import banner4 from '@/assets/local-banners/banner4.jpeg';
import genericCategory from '@/assets/data-icon.png';

/** Shown for categories (e.g. "Maamuus") that have no artwork in the Iftin API. */
export const genericCategoryImage = genericCategory;

export type LocalImageKind = 'provider' | 'payment' | 'category' | 'banner';

const normalize = (value: string | null | undefined) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const providerAssets: Array<[string[], string]> = [
  [['hormuud'], hormuud],
  [['somnet'], somnet],
  [['somtel', 'telesom'], somtel],
  [['amtel'], amtel],
  [['somlink'], somlink],
];

const paymentAssets: Array<[string[], string]> = [
  [['evc', 'evc plus'], evc],
  [['edahab', 'e dahab', 'golis'], edahab],
  [['jeeb'], jeeb],
  [['premier'], premier],
];

const categoryAssets: Array<[string[], string]> = [
  [['unlimited data voice somlink2'], unlimitedDataVoiceSomlink2],
  [['unlimited data voice somlink'], unlimitedDataVoiceSomlink],
  [['unlimited data voice somtel'], unlimitedDataVoiceSomtel],
  [['unlimited data voice hormuud', 'unlimited data and voice', 'unlimited data voice'], unlimitedDataVoiceHormuud],
  [['unlimited calls somtel'], unlimitedCallsSomtel],
  [['unlimited calls hormuud', 'unlimited calls'], unlimitedCallsHormuud],
  [['unlimited data hormuud', 'unlimited data'], unlimitedDataHormuud],
  [['unlimited voice'], unlimitedVoice],
  [['no expire somlink'], noExpireSomlink],
  [['no expire somtel', 'no expire'], noExpireSomtel],
  [['qanciye plus', 'qanciye'], qanciyePlus],
  [['anfac plus'], anfacPlus],
  [['anfac'], anfac],
  [['5g plus'], fiveGPlus],
  [['5g'], fiveG],
  [['adsl arday'], adslArday],
  [['adsl plus'], adslPlus],
  [['kaar kuhadal', 'kaar ku hadal'], kaarKuhadal],
  [['mifi internet', 'mifi'], mifiInternet],
  [['voice somtel', 'voice'], voiceSomtel],
];

const bannerAssets: Array<[string[], string]> = [
  [['banner1', 'iftin banner 1'], banner1],
  [['banner2', 'iftin banner 2'], banner2],
  [['banner3', 'iftin banner 3'], banner3],
  [['banner4', 'iftin banner 4'], banner4],
];

function match(entries: Array<[string[], string]>, values: string[]): string | null {
  const haystack = normalize(values.filter(Boolean).join(' '));
  for (const [aliases, asset] of entries) {
    if (aliases.some((alias) => haystack.includes(normalize(alias)))) return asset;
  }
  return null;
}

export function getLocalImage(
  kind: LocalImageKind,
  name?: string | null,
  source?: string | null,
  providerName?: string | null,
): string | null {
  const values = [name ?? '', source ?? '', providerName ?? ''];
  if (kind === 'provider') return match(providerAssets, values);
  if (kind === 'payment') return match(paymentAssets, values) ?? match(providerAssets, values);
  if (kind === 'banner') return match(bannerAssets, values);

  const providerSpecific = normalize(`${name ?? ''} ${source ?? ''} ${providerName ?? ''}`);
  if (providerSpecific.includes('unlimited') && providerSpecific.includes('somlink')) {
    return unlimitedDataVoiceSomlink;
  }
  if (providerSpecific.includes('unlimited') && providerSpecific.includes('somtel')) {
    return providerSpecific.includes('call') ? unlimitedCallsSomtel : unlimitedDataVoiceSomtel;
  }
  return match(categoryAssets, values);
}

export function localizeImage(
  kind: LocalImageKind,
  source?: string | null,
  name?: string | null,
  providerName?: string | null,
): string | null {
  // Artwork the tenant uploaded always wins — bundled assets are only a
  // fallback for entries that have no image of their own.
  const uploaded = (source ?? '').trim();
  if (uploaded) return uploaded;
  return getLocalImage(kind, name, source, providerName) ?? null;
}

export const bundledStaticImages = [
  ...providerAssets.map(([, asset]) => asset),
  ...paymentAssets.map(([, asset]) => asset),
  ...categoryAssets.map(([, asset]) => asset),
  ...bannerAssets.map(([, asset]) => asset),
];