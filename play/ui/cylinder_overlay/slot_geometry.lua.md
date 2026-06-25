# 개요

Cylinder overlay의 screen-space 좌표를 GUI slot index로 변환하는 순수 Lua 모듈.

# 슬롯 순서

GUI node 배치와 동일하게 위쪽을 `slot_1`로 두고 시계방향으로 증가한다.

```text
        1
    6       2
    5       3
        4
```

# I/O

- 입력: pointer 좌표, cylinder 중심, hit radius, slot count.
- 출력: 선택된 slot index 또는 radius 밖이면 `nil`.

# 원칙

- 슬롯 경계에서는 가장 가까운 슬롯 중심 방향으로 판정한다.
- 장전 및 실린더 회전 규칙은 담당하지 않는다.
- 장전은 `rules/cylinder.load`, 결투 전 회전은 `rules/cylinder.spin`이 담당한다.
