import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Provider } from 'react-redux'
import store from './store/store.ts'

// App-wide: the mouse wheel must never change a number input (unit price,
// quantity, amounts...). Blurring the focused number field before the browser
// applies the wheel step cancels the change, and the page scrolls as normal.
document.addEventListener('wheel', () => {
  const el = document.activeElement
  if (el instanceof HTMLInputElement && el.type === 'number') {
    el.blur()
  }
}, { passive: true })

createRoot(document.getElementById('root')!).render(
 
    <Provider store={store}>
      <App />
    </Provider>
,
)
