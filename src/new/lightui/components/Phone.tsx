import { ReactNode, useEffect } from 'react'
import { applyTheme, useTheme } from '../theme.ts'
import '../styles/base.css'

/**
 * Figma 프레임 한 장에 대응하는 셸 — 폭 420px.
 *
 * 예전에는 여기서 「9:41 LTE ▮」 상태바를 그렸습니다. Figma 프레임마다 있던 것이라
 * 그대로 옮겼는데, 실제로 도는 앱에서는 거짓말입니다. 시각도 전파도 가짜였고,
 * 기기의 진짜 상태바 아래에 하나가 더 붙는 꼴이었습니다. 그래서 뺐습니다 —
 * 상태바는 OS 가 그립니다. 화면 안에 보이는 시각(입장 18:42 같은 것)은 데이터라 그대로입니다.
 */

interface PhoneProps {
  children: ReactNode
  className?: string
}

const Phone = ({ children, className }: PhoneProps) => {
  // 시스템 설정이 바뀌면 다시 그리도록 구독만 해 둡니다
  useTheme()

  // 기존 앱은 body 가 검정입니다. 라이트 UI 가 떠 있는 동안만 테마 바탕으로 바꿉니다.
  useEffect(() => {
    document.body.classList.add('lui-page')
    applyTheme()
    return () => document.body.classList.remove('lui-page')
  }, [])

  return (
    <div className={`lui${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}

export default Phone
