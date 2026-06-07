import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import GeneratedLayoutPackage from '../golden-layout/src'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="visual-harness" data-d2c-harness="candidate">
      <div className="visual-harness__hostile-scope">
        <GeneratedLayoutPackage />
      </div>
    </main>
  </StrictMode>,
)
