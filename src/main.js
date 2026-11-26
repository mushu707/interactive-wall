import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { installGuard, armReloadReset } from './guard.js'
import './styles/theme.css'
import './styles/admin.css'

const app = createApp(App)
// 渲染抛错时不再静默变成黑屏，而是底部给一行提示（/screen 会自动刷新重试）
installGuard(app)
app.use(router).mount('#app')
armReloadReset()
