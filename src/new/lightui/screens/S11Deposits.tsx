import { useState } from 'react'
import Phone from '../components/Phone.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import { P } from '../paths.ts'
import { deposits as d, type DepositRow } from '../../mocks/bandyLight.ts'
import { COPY, useTicketStates } from '../pay/ticketState.ts'
import { freshClub, useIsDemoClub } from '../clubs/owner.ts'
import './S11Deposits.css'

/** S11 입금 관리 (주최자) — Figma 214:2 */
const Row = ({
  row,
  line,
  onConfirm,
  live,
}: {
  row: DepositRow
  line?: boolean
  onConfirm?: () => void
  /** 이 기기의 티켓과 묶인 줄 — 눌러서 실제로 열리는 유일한 줄입니다 */
  live?: boolean
}) => (
  <div className={`s11-row${line ? ' s11-row--line' : ''}`}>
    <div className="s11-row__top">
      <span className="s11-row__who">
        <span className="s11-row__name">{row.name}</span>
        {/* 입금 신고 = 예매자가 보냈다고 알린 건 (입금 대기와 구분) */}
        {row.reported && <span className="s11__reported">입금 신고</span>}
        {live && <span className="s11__live">이 기기</span>}
      </span>
      <span className="s11-row__amount">{row.amount}</span>
    </div>
    <div className="s11-row__bottom">
      <span className="s11-row__sub">{row.sub}</span>
      {row.reported ? (
        <button type="button" className="s11__confirm" onClick={onConfirm}>
          확인
        </button>
      ) : (
        <span className="s11-row__state">{row.state}</span>
      )}
    </div>
  </div>
)

type FilterKey = (typeof d.filters)[number]['key']

const S11Deposits = () => {
  const [filter, setFilter] = useState<FilterKey>('need')
  const [confirmed, setConfirmed] = useState<string[]>([])
  // 묶인 줄은 적어 둔 값이 아니라 티켓 상태에서 읽습니다.
  // 예매자가 「입금했어요」 를 누르면 여기 「입금 신고」 가 뜨고, 여기서
  // 확인을 누르면 저쪽 QR 이 열립니다 — 그게 수동 확인의 전부입니다.
  const { stateOf, confirm } = useTicketStates()
  // 적어 둔 42건은 멜로딕의 예매입니다 (clubs/owner.ts)
  const demo = useIsDemoClub()
  const live = (demo ? d.needCheck : []).map((r) =>
    r.showId ? { ...r, reported: stateOf(r.showId) === 'reported', state: COPY[stateOf(r.showId)].pill } : r,
  )

  const rows = live.filter((r) => !confirmed.includes(r.name) && r.state !== '입금 확인됨')
  // 확인을 누르면 그만큼 「입금 완료」 쪽으로 옮겨 갑니다
  const movedToPaid = live.filter((r) => confirmed.includes(r.name) || r.state === '입금 확인됨')
  const refunded = demo ? d.refunded : []
  const paid = demo
    ? [...movedToPaid.map((r) => ({ ...r, reported: false, state: '입금 완료' })), ...d.paid]
    : []

  const counts: Record<FilterKey, number> = {
    need: rows.length,
    paid: demo ? d.done + movedToPaid.length : 0,
    refund: demo ? d.refunded.length : 0,
  }

  return (
    <Phone>
      <TopBar
        title="입금 관리"
        right={
          <MoreMenu
            items={[
              { label: '정산 보기', to: P.settlement },
              {
                label: '입금 안내 다시 보내기',
                note: '아직 입금하지 않은 사람에게 계좌와 기한을 다시 알려 줍니다. 하루 한 번만 보낼 수 있어요.',
              },
            ]}
          />
        }
      />
      <div className="lui-body">
        <div className="s11">
          <p className="s11__line">{demo ? d.summaryLine : freshClub.deposits}</p>
          <div className="s11__gap-6" />
          <p className="s11__big">
            {demo ? d.done + movedToPaid.length : 0} <em>/ {demo ? d.total : 0}</em>
          </p>
          <div className="s11__gap-18" />
          <div className="s11__filters">
            {d.filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={f.key === filter}
                className={`s11-filter${f.key === filter ? ' s11-filter--on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} {counts[f.key]}
              </button>
            ))}
          </div>

          <div className="s11__gap-24" />

          {filter === 'need' && (
            <>
              <div className="s11__sec">
                <span className="s11__sec-title">확인 필요한 예매</span>
                <span className="s11__sec-aside">예매순</span>
              </div>
              <div className="s11__gap-6" />
              {rows.length === 0 ? (
                <p className="s11__empty">{demo ? d.empty.need : freshClub.depositsBody}</p>
              ) : (
                rows.map((row, i) => (
                  <Row
                    key={row.name}
                    row={row}
                    line={i < rows.length - 1}
                    live={Boolean(row.showId)}
                    onConfirm={() => {
                      if (row.showId) confirm(row.showId)
                      setConfirmed((prev) => [...prev, row.name])
                    }}
                  />
                ))
              )}

              <div className="s11__gap-26" />
              <div className="s11__sec">
                <span className="s11__sec-title">기한이 지난 예매</span>
                <span className="s11__sec-aside">{demo ? d.expiredCount : '0건'}</span>
              </div>
              <div className="s11__gap-6" />
              {(demo ? d.expired : []).map((row) => (
                <Row key={row.name} row={row} />
              ))}
            </>
          )}

          {filter === 'paid' && (
            <>
              <div className="s11__sec">
                <span className="s11__sec-title">입금이 끝난 예매</span>
                <span className="s11__sec-aside">{d.paidMore}</span>
              </div>
              <div className="s11__gap-6" />
              {paid.length === 0 ? (
                <p className="s11__empty">{d.empty.paid}</p>
              ) : (
                paid.map((row, i) => <Row key={row.name} row={row} line={i < paid.length - 1} />)
              )}
            </>
          )}

          {filter === 'refund' && (
            <>
              <div className="s11__sec">
                <span className="s11__sec-title">환불한 예매</span>
                <span className="s11__sec-aside">{counts.refund}건</span>
              </div>
              <div className="s11__gap-6" />
              {refunded.length === 0 ? (
                <p className="s11__empty">{d.empty.refund}</p>
              ) : (
                refunded.map((row, i) => (
                  <Row key={row.name} row={row} line={i < refunded.length - 1} />
                ))
              )}
            </>
          )}

          <div className="s11__gap-22" />
          <p className="s11__note">{d.note}</p>
        </div>
      </div>
      {/* 운영 화면의 집은 마이 > 운영입니다 — 들어온 길과 켜진 탭이 같아야 합니다 */}
      <TabBar active="my" />
    </Phone>
  )
}

export default S11Deposits
