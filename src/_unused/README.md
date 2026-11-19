# 안 쓰는 코드

지금 앱 어디에서도 불리지 않는 파일들입니다. 지우지 않고 여기로 내려 뒀습니다 —
나중에 다시 쓸 수도 있고, 지난 결정이 왜 그랬는지 볼 자리가 되기도 합니다.

`src/main.tsx` 에서 import 를 따라가며 한 번도 닿지 않는 파일을 찾아 옮겼습니다.
눈으로 고르지 않았습니다.

| 어디 있던 것 | 무엇 |
|---|---|
| `brand/sections` | 랜딩 초안에 있던 네 섹션 (Connect · Exchange · Proof · Why). 지금 `BrandLanding` 은 이것들을 부르지 않습니다 |
| `brand/components` | `CableConnect` — 위 섹션이 쓰던 것 |
| `lightui/components` | `AppBar` · `KVRow` — `TopBar` 와 `SummaryBox` 로 대체됐습니다 |
| `legacy/components` | `Performers` · `Setlist` · `Ticket` — 2025 공연 앱 조각 |
| `legacy/games` | 현장 게임 8종. 실제로 쓰인 건 `RouletteMirror` · `EntryNumberDrawMirror` · `LEDBoard` 셋뿐입니다 |
| `legacy/pages` | `Bands` · `Venues` — 라우트에 연결된 적이 없습니다 |
| `legacy/services` | `googleSheetsService` · `storageService` |

## 주의

옮기면서 상대 경로가 깨졌고, **일부러 고치지 않았습니다.** 쓰지 않을 코드를 계속
손보면 분리한 뜻이 없습니다. `tsconfig.json` 의 `exclude` 에 들어 있어 타입체크와
빌드에서 빠집니다.

다시 쓰려면 원래 자리로 옮기고 import 를 맞추세요.
