import { ReactNode } from 'react'
import AllowedOnly from './AllowedOnly.tsx'

/**
 * 동아리 운영진만 들어올 수 있는 화면.
 *
 * 속은 `AllowedOnly` 가 합니다 — 권한이 동아리 운영진 하나뿐이던 때 만든
 * 이름이라, 쓰는 곳이 열다섯 군데라 그대로 두고 껍데기만 남겼습니다.
 * 새로 감쌀 화면은 `AllowedOnly` 에 무엇이 필요한지 적어 주세요.
 */
const ManagerOnly = ({
  title,
  what,
  children,
}: {
  title: string
  what: string
  children: ReactNode
}) => (
  <AllowedOnly need="club-manager" title={title} what={what}>
    {children}
  </AllowedOnly>
)

export default ManagerOnly
