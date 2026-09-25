import {
  createDefaultAccentShapeStyle,
  createDefaultLayerSettings,
  createDefaultLayerTransforms,
  DEFAULT_SLIDE_TRANSFORM,
} from '../data'
import type { EditorProject } from './project'
import type { AccentShapeStyle, DeviceFrameId, LayoutId, Slide, ThemeId } from '../types'

interface DemoSlideDefaults {
  title: string
  subtitle: string
  layout: LayoutId
  theme: ThemeId
  deviceFrameId: DeviceFrameId
  accentShapeStyle: AccentShapeStyle
  screenshotTransform: Partial<Slide['layerTransforms']['screenshot']>
  headlineTransform?: Partial<Slide['layerTransforms']['headline']>
}

const svgDataUrl = (svg: string) => {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

const createAppIcon = () => svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="30" fill="#6558e8"/>
  <path d="M36 32h56a10 10 0 0 1 10 10v54a10 10 0 0 1-10 10H36a10 10 0 0 1-10-10V42a10 10 0 0 1 10-10Z" fill="#fff" opacity=".96"/>
  <path d="m43 66 13 13 29-33" fill="none" stroke="#6558e8" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`)

const createScreenshot = (index: number) => {
  const content = [
    `<rect x="24" y="176" width="342" height="150" rx="24" fill="#6558e8"/>
     <circle cx="348" cy="208" r="28" fill="#a99dff" opacity=".55"/>
     <text x="48" y="218" fill="#dcd8ff" font-size="14" font-family="Arial,sans-serif" font-weight="700" letter-spacing="1.4">TODAY</text>
     <text x="48" y="260" fill="#fff" font-size="28" font-family="Arial,sans-serif" font-weight="700">Good morning, Alex</text>
     <text x="48" y="290" fill="#e5e2ff" font-size="14" font-family="Arial,sans-serif">Three small steps make a great day.</text>
     <g transform="translate(24 346)"><rect width="104" height="92" rx="18" fill="#fff"/><text x="18" y="29" fill="#8c8998" font-size="12" font-family="Arial,sans-serif">PLANNED</text><text x="18" y="65" fill="#292637" font-size="28" font-family="Arial,sans-serif" font-weight="700">08</text></g>
     <g transform="translate(143 346)"><rect width="104" height="92" rx="18" fill="#fff"/><text x="18" y="29" fill="#8c8998" font-size="12" font-family="Arial,sans-serif">FOCUS</text><text x="18" y="65" fill="#292637" font-size="28" font-family="Arial,sans-serif" font-weight="700">2h 15m</text></g>
     <g transform="translate(262 346)"><rect width="104" height="92" rx="18" fill="#fff"/><text x="18" y="29" fill="#8c8998" font-size="12" font-family="Arial,sans-serif">DONE</text><text x="18" y="65" fill="#292637" font-size="28" font-family="Arial,sans-serif" font-weight="700">05</text></g>
     <text x="24" y="483" fill="#292637" font-size="18" font-family="Arial,sans-serif" font-weight="700">Up next</text>
     <g transform="translate(24 505)"><rect width="342" height="66" rx="17" fill="#fff"/><circle cx="31" cy="33" r="12" fill="#e9e6ff"/><path d="m26 33 4 4 7-9" fill="none" stroke="#6558e8" stroke-width="3" stroke-linecap="round"/><text x="56" y="29" fill="#33313d" font-size="14" font-family="Arial,sans-serif" font-weight="700">Review launch checklist</text><text x="56" y="48" fill="#9693a0" font-size="12" font-family="Arial,sans-serif">Work · 20 min</text></g>
     <g transform="translate(24 583)"><rect width="342" height="66" rx="17" fill="#fff"/><circle cx="31" cy="33" r="12" fill="#def6e9"/><path d="m26 33 4 4 7-9" fill="none" stroke="#248b63" stroke-width="3" stroke-linecap="round"/><text x="56" y="29" fill="#33313d" font-size="14" font-family="Arial,sans-serif" font-weight="700">Send project update</text><text x="56" y="48" fill="#9693a0" font-size="12" font-family="Arial,sans-serif">Studio · 15 min</text></g>`,
    `<text x="24" y="198" fill="#8c8998" font-size="13" font-family="Arial,sans-serif" font-weight="700" letter-spacing="1.2">FOCUS SESSION</text>
     <text x="24" y="244" fill="#193c30" font-size="30" font-family="Arial,sans-serif" font-weight="700">Make space to focus</text>
     <rect x="24" y="276" width="342" height="210" rx="28" fill="#193c30"/>
     <circle cx="195" cy="380" r="70" fill="none" stroke="#dff3e5" stroke-width="12" opacity=".18"/>
     <path d="M195 310a70 70 0 1 1-65 44" fill="none" stroke="#70d6aa" stroke-width="12" stroke-linecap="round"/>
     <text x="195" y="377" text-anchor="middle" fill="#fff" font-size="42" font-family="Arial,sans-serif" font-weight="700">24:18</text>
     <text x="195" y="402" text-anchor="middle" fill="#b9d7c9" font-size="12" font-family="Arial,sans-serif">remaining</text>
     <text x="24" y="530" fill="#193c30" font-size="18" font-family="Arial,sans-serif" font-weight="700">Session intention</text>
     <rect x="24" y="550" width="342" height="90" rx="20" fill="#fff" stroke="#cce8da"/>
     <text x="46" y="581" fill="#248b63" font-size="11" font-family="Arial,sans-serif" font-weight="700" letter-spacing="1">DEEP WORK</text>
     <text x="46" y="613" fill="#29463b" font-size="17" font-family="Arial,sans-serif" font-weight="700">Outline the final story</text>
     <text x="24" y="680" fill="#193c30" font-size="18" font-family="Arial,sans-serif" font-weight="700">Soundscape</text>
     <g transform="translate(24 700)"><rect width="164" height="70" rx="17" fill="#fff"/><circle cx="30" cy="35" r="16" fill="#dff3e5"/><path d="m27 28 14 7-14 7Z" fill="#248b63"/><text x="56" y="31" fill="#29463b" font-size="13" font-family="Arial,sans-serif" font-weight="700">Soft rain</text><text x="56" y="48" fill="#8ba298" font-size="10" font-family="Arial,sans-serif">32 min loop</text></g>
     <g transform="translate(202 700)"><rect width="164" height="70" rx="17" fill="#6558e8"/><text x="82" y="42" text-anchor="middle" fill="#fff" font-size="13" font-family="Arial,sans-serif" font-weight="700">+ Add sound</text></g>`,
    `<text x="24" y="198" fill="#685d84" font-size="13" font-family="Arial,sans-serif" font-weight="700" letter-spacing="1.2">WEEKLY INSIGHTS</text>
     <text x="24" y="242" fill="#292637" font-size="29" font-family="Arial,sans-serif" font-weight="700">Your momentum</text>
     <text x="24" y="270" fill="#888494" font-size="14" font-family="Arial,sans-serif">A fictional view of your best work rhythm.</text>
     <g transform="translate(24 302)"><rect width="342" height="190" rx="24" fill="#fff"/><text x="22" y="34" fill="#7e798d" font-size="12" font-family="Arial,sans-serif" font-weight="700">FOCUS MINUTES</text><text x="22" y="78" fill="#292637" font-size="38" font-family="Arial,sans-serif" font-weight="700">486</text><text x="128" y="77" fill="#248b63" font-size="12" font-family="Arial,sans-serif" font-weight="700">+18% this week</text><g transform="translate(22 103)"><rect x="0" y="45" width="30" height="24" rx="7" fill="#dcd6ff"/><rect x="50" y="26" width="30" height="43" rx="7" fill="#cfc7ff"/><rect x="100" y="12" width="30" height="57" rx="7" fill="#b8adff"/><rect x="150" y="34" width="30" height="35" rx="7" fill="#c8bfff"/><rect x="200" y="3" width="30" height="66" rx="7" fill="#6558e8"/><rect x="250" y="20" width="30" height="49" rx="7" fill="#9285f0"/><rect x="295" y="29" width="25" height="40" rx="7" fill="#b5abf8"/></g></g>
     <text x="24" y="535" fill="#292637" font-size="18" font-family="Arial,sans-serif" font-weight="700">Recent wins</text>
     <g transform="translate(24 555)"><rect width="342" height="78" rx="19" fill="#fff"/><circle cx="40" cy="39" r="22" fill="#e6e1ff"/><text x="40" y="45" text-anchor="middle" fill="#6558e8" font-size="18" font-family="Arial,sans-serif" font-weight="700">7</text><text x="77" y="34" fill="#33313d" font-size="14" font-family="Arial,sans-serif" font-weight="700">day focus streak</text><text x="77" y="54" fill="#9693a0" font-size="11" font-family="Arial,sans-serif">A new personal best</text></g>
     <g transform="translate(24 647)"><rect width="342" height="78" rx="19" fill="#fff"/><circle cx="40" cy="39" r="22" fill="#dff3e5"/><text x="40" y="45" text-anchor="middle" fill="#248b63" font-size="18" font-family="Arial,sans-serif" font-weight="700">5</text><text x="77" y="34" fill="#33313d" font-size="14" font-family="Arial,sans-serif" font-weight="700">projects completed</text><text x="77" y="54" fill="#9693a0" font-size="11" font-family="Arial,sans-serif">Keep the rhythm going</text></g>`,
  ][index]

  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
    <rect width="390" height="844" rx="44" fill="#f7f7fb"/>
    <rect x="145" y="16" width="100" height="24" rx="12" fill="#171620"/>
    <text x="24" y="82" fill="#292637" font-size="23" font-family="Arial,sans-serif" font-weight="700">Luma</text>
    <circle cx="345" cy="72" r="18" fill="#e6e1ff"/><text x="345" y="78" text-anchor="middle" fill="#6558e8" font-size="14" font-family="Arial,sans-serif" font-weight="700">A</text>
    <g transform="translate(24 106)"><rect width="81" height="28" rx="14" fill="#ffffff"/><text x="40" y="19" text-anchor="middle" fill="#6f6b7a" font-size="11" font-family="Arial,sans-serif" font-weight="700">TODAY</text><text x="130" y="19" fill="#aaa6b2" font-size="11" font-family="Arial,sans-serif">FOCUS</text><text x="230" y="19" fill="#aaa6b2" font-size="11" font-family="Arial,sans-serif">INSIGHTS</text></g>
    ${content}
    <rect x="120" y="793" width="150" height="5" rx="3" fill="#292637"/>
    <text x="24" y="762" fill="#aaa6b2" font-size="8" font-family="Arial,sans-serif" letter-spacing="1.2">DEMO DATA • FAKE PRODUCT UI</text>
  </svg>`)
}

const createDemoSlide = (defaults: DemoSlideDefaults, screenshotIndex: number, appIconDataUrl: string): Slide => {
  const layerTransforms = createDefaultLayerTransforms()
  layerTransforms.screenshot = { ...layerTransforms.screenshot, ...defaults.screenshotTransform }
  if (defaults.headlineTransform) {
    layerTransforms.headline = { ...layerTransforms.headline, ...defaults.headlineTransform }
  }

  return {
    id: `demo-slide-${crypto.randomUUID()}`,
    title: defaults.title,
    subtitle: defaults.subtitle,
    layout: defaults.layout,
    theme: defaults.theme,
    deviceFrameId: defaults.deviceFrameId,
    transform: { ...DEFAULT_SLIDE_TRANSFORM },
    layerTransforms,
    layerSettings: createDefaultLayerSettings(),
    accentShapeStyle: { ...createDefaultAccentShapeStyle(), ...defaults.accentShapeStyle },
    appIcon: {
      name: 'Luma demo app icon.svg',
      dataUrl: appIconDataUrl,
      mimeType: 'image/svg+xml',
    },
    backgroundImage: null,
    screenshot: createScreenshot(screenshotIndex),
    screenshotName: `Luma demo screen ${screenshotIndex + 1}.svg`,
  }
}

/** Creates a complete three-slide example without network requests or bundled media. */
export const createDemoProject = (): EditorProject => {
  const appIconDataUrl = createAppIcon()
  return {
    name: 'Luma focus app — generated demo',
    slides: [
      createDemoSlide({
        title: 'Plan less.\nMove with clarity.',
        subtitle: 'Meet Luma, a fictional focus app that turns a busy day into three calm next steps.',
        layout: 'hero',
        theme: 'ocean',
        deviceFrameId: 'iphone',
        accentShapeStyle: { type: 'circle', color: '#4b9ee8' },
        screenshotTransform: { y: 4, scale: 0.92 },
        headlineTransform: { scale: 0.98 },
      }, 0, appIconDataUrl),
      createDemoSlide({
        title: 'Find your flow.\nProtect your time.',
        subtitle: 'A guided session and simple soundscapes make focused work feel approachable.',
        layout: 'spotlight',
        theme: 'mint',
        deviceFrameId: 'iphone',
        accentShapeStyle: { type: 'pill', color: '#70d6aa' },
        screenshotTransform: { x: 4, y: 2, rotation: 2, scale: 0.9 },
        headlineTransform: { x: -2, scale: 0.94 },
      }, 1, appIconDataUrl),
      createDemoSlide({
        title: 'See momentum.\nCelebrate progress.',
        subtitle: 'Friendly sample insights turn small wins into motivation you can feel.',
        layout: 'caption-left',
        theme: 'lilac',
        deviceFrameId: 'none',
        accentShapeStyle: { type: 'circle', color: '#bda8ff' },
        screenshotTransform: { x: 3, y: 2, scale: 0.78 },
        headlineTransform: { x: -3, scale: 0.96 },
      }, 2, appIconDataUrl),
    ],
    activeLocale: 'en-US',
    canvasMode: 'isolated',
    selectedExportProfileId: 'app-store-1125',
  }
}
