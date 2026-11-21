import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { useBankAccount } from '../pay/bankAccount.ts'
import './S29BankAccount.css'

/**
 * S29 입금 계좌 — 예매자가 돈을 보낼 곳.
 *
 * 이 화면이 없어서 운영진이 **예매를 영영 열 수 없었습니다.** 공연 상태
 * 화면은 「계좌를 등록해야 예매자가 돈을 보낼 수 있습니다」 라고 하는데,
 * 등록할 자리가 어디에도 없었습니다.
 *
 * 계좌번호는 숨길 값이 아닙니다 — 예매자에게 보여 줘야 하는 값입니다.
 * 다만 **바꾸는 것**은 운영진만 할 수 있어야 해서 운영 화면 아래 둡니다.
 */
const S29BankAccount = () => {
  const navigate = useNavigate()
  const { bank, ready, setBankAccount, forgetBankAccount } = useBankAccount()

  const [name, setName] = useState(bank?.name ?? '')
  const [account, setAccount] = useState(bank?.account ?? '')
  const [holder, setHolder] = useState(bank?.holder ?? '')
  const [saved, setSaved] = useState(false)

  // 셋이 다 있어야 합니다. 하나라도 비면 예매자가 못 보냅니다.
  const canSave = Boolean(name.trim() && account.trim() && holder.trim())

  const save = () => {
    if (!canSave) return
    setBankAccount({ name: name.trim(), account: account.trim(), holder: holder.trim() })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <Phone>
      <TopBar title="입금 계좌" />
      <div className="lui-body">
        <div className="s29">
          <div className="s29__gap-14" />
          <p className="s29__lead">
            예매자가 여기로 돈을 보냅니다. 입금 안내와 정산 화면에 그대로 보이니{' '}
            <b>동아리 계좌</b>를 적어 주세요.
          </p>

          <div className="s29__gap-26" />
          <SectionHeader title="계좌" />

          <span className="s29__label">은행</span>
          <input
            className="lui-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 국민"
            maxLength={20}
          />

          <div className="s29__gap-14" />
          <span className="s29__label">계좌번호</span>
          <input
            className="lui-input"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="숫자와 - 만"
            inputMode="numeric"
            maxLength={30}
          />

          <div className="s29__gap-14" />
          <span className="s29__label">예금주</span>
          <input
            className="lui-input"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            placeholder="통장에 적힌 이름 그대로"
            maxLength={30}
          />

          <div className="s29__gap-26" />
          {/* 적은 것이 예매자에게 어떻게 보이는지 그대로 보여 줍니다 —
              오타는 여기서 잡혀야 합니다. 보내고 나면 늦습니다. */}
          <SectionHeader title="예매자에게 이렇게 보입니다" />
          <div className="lui-card s29__preview">
            <div className="s29__row">
              <span className="s29__k">은행</span>
              <span className="s29__v">{name.trim() || '—'}</span>
            </div>
            <div className="s29__row">
              <span className="s29__k">계좌번호</span>
              <span className="s29__v">{account.trim() || '—'}</span>
            </div>
            <div className="s29__row">
              <span className="s29__k">예금주</span>
              <span className="s29__v">{holder.trim() || '—'}</span>
            </div>
          </div>

          <div className="s29__gap-26" />
          <p className="s29__notice">
            계좌가 없으면 예매를 열 수 없습니다. 돈을 받을 곳이 없는 공연을 팔 수는 없으니까요.
          </p>

          {ready && (
            <>
              <div className="s29__gap-14" />
              <button
                type="button"
                className="s29__clear"
                onClick={() => {
                  forgetBankAccount()
                  setName('')
                  setAccount('')
                  setHolder('')
                }}
              >
                등록한 계좌 지우기
              </button>
            </>
          )}
        </div>
      </div>

      <div className="lui-bottombar lui-bottombar--stack">
        <Button block disabled={!canSave} onClick={save}>
          {saved ? '저장했어요' : '저장하기'}
        </Button>
        <button type="button" className="s29__back" onClick={() => navigate(P.console)}>
          운영으로 돌아가기
        </button>
      </div>
    </Phone>
  )
}

export default S29BankAccount
