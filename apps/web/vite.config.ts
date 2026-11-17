import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
 base:process.env.GITHUB_PAGES_BASE||'/obs-tally-pro/',
 plugins:[react(),VitePWA({
  registerType:'autoUpdate',includeAssets:['bumbi-logo.png','bumbi-mark-192.png','bumbi-mark-512.png'],
  manifest:{name:'OBS TALLY PRO 3.1',short_name:'OBS TALLY 3.1',description:'Secure wireless cameraman tally lights',
   theme_color:'#080B12',background_color:'#080B12',display:'standalone',start_url:'./#/',scope:'./',
   icons:[{src:'bumbi-mark-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'bumbi-mark-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]},
  workbox:{navigateFallback:'index.html',globPatterns:['**/*.{js,css,html,svg,webmanifest}'],
   runtimeCaching:[]}
 })],
});
