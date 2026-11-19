import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { entryDesk as e } from '../../mocks/bandyLight.ts'
import scanFrame from '../assets/scan-frame.svg'
import './S12Entry.css'

/** S12 입장 관리 · QR — Figma 215:2 */
const S12Entry = () => {
  const navigate = useNavigate()

  return (
    <Phone>
      <TopBar
        title="입장 관리"
        right={
          <MoreMenu
            items={[
              { label: '입금 관리', to: P.deposits },
              {
                label: '입장 안내',
                note: 'QR 이 안 읽히면 이름으로 찾아 수동 입장 처리할 수 있습니다. 현장 판매는 입금 확인 뒤 바로 입장됩니다.',
              },
            ]}
          />
        }
      />
      <div className="lui-body">
        <div className="s12__scan">
          <img src={scanFrame} alt="" />
          <p className="s12__scan-hint">{e.scanHint}</p>
        </div>

        <div className="s12__body">
          <div className="lui-card s12__count">
            <div className="s12__count-top">
              <span>
                <span className="s12__count-now">{e.entered}</span>
                <span className="s12__count-of">/ {e.capacity}명 입장</span>
              </span>
              <span className="lui-pill lui-pill--lg">{e.badge}</span>
            </div>
            <span className="s12__bar">
              <span style={{ width: `${(e.entered / e.capacity) * 100}%` }} />
            </span>
          </div>

          <div className="s12__gap-26" />
          <SectionHeader title="방금 입장" aside={String(e.recent.length)} />
          <div className="lui-card s12__recent">
            {e.recent.map((row) => (
              <ListRow
                key={row.name}
                avatar={row.initial}
                title={row.name}
                sub={row.sub}
                slot={<span className="lui-pill lui-pill--lg lui-pill--outline">완료</span>}
              />
            ))}
          </div>

          <div className="s12__gap-26" />
          <SectionHeader title="현장 판매" />
          <div className="lui-card s12__onsite">
            <ListRow
              title={e.onsite.title}
              sub={e.onsite.sub}
              chevron
              onClick={() => navigate(P.deposits)}
            />
          </div>

          <div className="s12__gap-14" />
          <div className="s12__pair">
            {/* 규칙 1 — 기본 버튼은 「입장 마감」 하나 */}
            <Button variant="ghost">이름으로 찾기</Button>
            <Button onClick={() => navigate(P.settlement)}>입장 마감</Button>
          </div>
        </div>
      </div>
    </Phone>
  )
}

export default S12Entry
