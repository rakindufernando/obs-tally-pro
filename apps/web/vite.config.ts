import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
 base:process.env.GITHUB_PAGES_BASE||'/obs-tally-pro/',
 plugins:[react(),VitePWA({
  registerType:'autoUpdate',includeAssets:['icon.svg'],
  manifest:{name:'OBS TALLY PRO',short_name:'OBS TALLY',description:'Secure wireless cameraman tally lights',
   theme_color:'#080B12',background_color:'#080B12',display:'standalone',start_url:'./#/',scope:'./',
   icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},
  workbox:{navigateFallback:'index.html',globPatterns:['**/*.{js,css,html,svg,webmanifest}'],
   runtimeCaching:[]}
 })],
});
