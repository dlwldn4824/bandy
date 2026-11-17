// Claude Artifact(공유 링크)용 데모 진입점. 앱 전체를 HTML 한 파일로 묶어 올린다(scripts/build-bandy-artifact.mjs).
// Artifact 화면은 주소창 경로를 바꿀 수 없어 MemoryRouter로 앱 안에서만 화면을 바꾼다. 데이터는 그 브라우저에만 저장되는 데모.
import ReactDOM from 'react-dom/client'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import BandyApp from './BandyApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/app']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/app/*" element={<BandyApp />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  </MemoryRouter>,
)
