import { clerkPlugin } from '@clerk/vue';
import { convexVue } from 'convex-vue';
import { createApp } from 'vue';
import App from './app/App.vue';
import './app/theme.css';
import './app/styles.css';
import { readConvexRuntimeConfig } from './services/convex/convexClient';
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
    throw new Error('Add your Clerk Publishable Key to .env.local');
}
const app = createApp(App);
app.use(clerkPlugin, { publishableKey: PUBLISHABLE_KEY });
app.use(convexVue, { url: readConvexRuntimeConfig().url });
app.mount('#app');
