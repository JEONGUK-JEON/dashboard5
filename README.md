# 범우연합 통합 대시보드

매출분석 + 채권현황을 통합한 정적 웹 대시보드입니다. GitHub Pages로 배포해 사용합니다.

## 파일 구성

```
/
├── index.html        # 메인 HTML (게이트 + 탭 구조)
├── styles.css        # 스타일시트
├── script.js         # 차트·인터랙션 로직
├── sales_data.json   # 매출 데이터
├── bond_data.json    # 채권 데이터
└── README.md
```

## 탭 구성

| 탭 | 설명 |
|----|------|
| 🔗 통합 | 법인 선택 → 매출·채권 KPI를 나란히 + 추이·비교 차트 2×2 |
| 📈 매출분석 | 월별 매출 추이, YoY, YTD, 12M MA, 법인별 비교 |
| 📋 채권현황 | A~D 등급별 채권, 전월대비 증감, 법인별 비교 |

## 비밀번호

`buhmwoo2026`

변경 시 `index.html`의 `passwordHash`를 원하는 비밀번호의 SHA-256 hex 값으로 교체하세요.

## GitHub Pages 배포

1. 저장소 루트에 파일 업로드
2. Settings → Pages → Branch: `main` / Folder: `/ (root)` 선택
3. 저장 후 생성된 URL 접속

## 자동 로그인 (Streamlit 연동)

URL 파라미터 `?v=TOKEN&u=USERNAME` 형식으로 접근 시 자동 로그인  
토큰 생성 방식: `SHA256("buhmwoo2026!@#" + username + YYYYMMDD)`

## 데이터 갱신

- **매출**: `sales_data.json` 의 각 법인 `months` 배열에 새 월 데이터 추가 후 `latestMonth` 업데이트
- **채권**: `bond_data.json` 의 각 법인 `periods` 객체에 새 월 추가 후 `script.js`의 `B_PERIODS` / `B_LABELS` 배열에 추가
