import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { P } from '../paths.ts'
import { deposits, entryDesk as e } from '../../mocks/bandyLight.ts'
import scanFrame from '../assets/scan-frame.svg'
import './S12Entry.css'

/**
 * S12 입장 관리 · QR — Figma 215:2
 *
 * 「이름으로 찾기」 는 누르면 아무 일도 없는 버튼이었습니다. 위 ⋯ 메뉴에는
 * 「QR 이 안 읽히면 이름으로 찾아 수동 입장 처리할 수 있습니다」 라고 적어
 * 두고요. QR 이 안 읽히는 건 현장에서 실제로 일어나는 일이라, 그때 할 수
 * 있는 게 없으면 줄이 섭니다.
 *
 * 찾는 대상은 **입금이 끝난 사람**입니다. 확인 전인 사람도 같이 보여 주되
 * 입장은 막습니다 — 현장에서 「왜 안 되는지」 를 알아야 하니까요.
 */
const S12Entry = () => {
  const navigate = useNavigate()
  const [finding, setFinding] = useState(false)
  const [q, setQ] = useState('')
  const [entered, setEntered] = useState<string[]>([])

  const found = useMemo(() => {
    const needle = q.trim()
    if (!needle) return []
    const rows = [
      ...deposits.paid.map((r) => ({ ...r, ok: true })),
      ...deposits.needCheck.map((r) => ({ ...r, ok: false })),
    ]
    return rows.filter((r) => r.name.includes(needle))
  }, [q])

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
            <Button variant="ghost" onClick={() => setFinding(true)}>
              이름으로 찾기
            </Button>
            <Button onClick={() => navigate(P.settlement)}>입장 마감</Button>
          </div>
        </div>
      </div>

      <Sheet open={finding} title="이름으로 찾기" onClose={() => setFinding(false)}>
        <input
          className="lui-input"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="예매자 이름"
          maxLength={20}
          autoFocus
        />
        {q.trim() === '' ? (
          <p className="lui-menu__note">예매할 때 적은 이름으로 찾습니다.</p>
        ) : found.length === 0 ? (
          <p className="lui-menu__note">
            「{q.trim()}」 으로 예매한 사람이 없습니다. 다른 이름으로 샀을 수 있어요.
          </p>
        ) : (
          <div className="lui-card s12__found">
            {found.map((r) => (
              <ListRow
                key={`${r.name}-${r.sub}`}
                title={r.name}
                sub={r.ok ? r.sub : `${r.sub} · 입금 확인 전`}
                slot={
                  entered.includes(r.name) ? (
                    <span className="lui-pill lui-pill--lg lui-pill--outline">완료</span>
                  ) : r.ok ? (
                    <Button
                      size="sm"
                      onClick={() => setEntered((prev) => [...prev, r.name])}
                    >
                      입장
                    </Button>
                  ) : (
                    <span className="s12__blocked">입금 확인 전</span>
                  )
                }
              />
            ))}
          </div>
        )}
      </Sheet>
    </Phone>
  )
}

export default S12Entry
