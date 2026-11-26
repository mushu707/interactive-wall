import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/screen' },
  { path: '/screen', name: 'screen', component: () => import('./pages/Screen.vue'), meta: { bare: true } },
  { path: '/submit', name: 'submit', component: () => import('./pages/Submit.vue') },
  { path: '/me', name: 'me', component: () => import('./pages/Me.vue') },
  { path: '/wall', name: 'wall', component: () => import('./pages/Wall.vue') },
  { path: '/admin', name: 'admin', component: () => import('./pages/Admin.vue'), meta: { bare: true } },
  { path: '/:pathMatch(.*)*', redirect: '/screen' }
]

export default createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})
