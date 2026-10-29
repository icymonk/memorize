import type { TemplateDraft } from './template'

/** MATH-14 자주 쓰는 형식 6종. 고르면 숫자 범위만 고쳐서 쓴다 */
export interface Preset { id: string, name: string, unit: string, choice: boolean, template: TemplateDraft }

export const PRESETS: Preset[] = [
  {
    id: 'linear',
    name: '일차방정식 ax + b = c',
    unit: 'm1-04-3',
    choice: false,
    template: {
      prompt: '일차방정식 $ {a}x + {b} = {c} $ 의 해를 구하세요.',
      vars: [
        { name: 'a', kind: 'int', min: 2, max: 9 },
        { name: 'b', kind: 'int', min: 1, max: 20 },
        { name: 'r', kind: 'int', min: -9, max: 9, exclude: [0] },
      ],
      calc: [{ name: 'c', expr: 'a * r + b' }],
      answerExpr: 'r',
      wrongExprs: ['-r', 'r + 1', '(c + b) / a'],
      explanation: '양변에서 {b}를 빼면 $ {a}x = {c - b} $, 양변을 {a}로 나누면 $ x = {r} $',
    },
  },
  {
    id: 'fraction-add',
    name: '분수의 덧셈',
    unit: 'e5-05-1',
    choice: false,
    template: {
      prompt: '$ \\frac{{p}}{{a}} + \\frac{{q}}{{b}} $ 를 계산하세요.',
      vars: [
        { name: 'a', kind: 'int', min: 2, max: 9 },
        { name: 'b', kind: 'int', min: 2, max: 9 },
        { name: 'p', kind: 'int', min: 1, max: 8 },
        { name: 'q', kind: 'int', min: 1, max: 8 },
      ],
      conds: ['a != b', 'p < a', 'q < b', 'gcd(p, a) == 1', 'gcd(q, b) == 1'],
      answerExpr: 'p / a + q / b',
      wrongExprs: ['(p + q) / (a + b)', '(p + q) / (a * b)', 'p * q / (a * b)'],
      explanation: '분모를 {lcm(a, b)}로 통분하면 $ {p/a} + {q/b} = {p/a + q/b} $',
    },
  },
  {
    id: 'percent',
    name: '비와 비율 (백분율)',
    unit: 'e6-04-3',
    choice: false,
    template: {
      prompt: '전체 {t}명 중 {p}%가 안경을 썼어요. 안경을 쓴 사람은 몇 명일까요?',
      vars: [
        { name: 't', kind: 'int', min: 20, max: 200, step: 10 },
        { name: 'p', kind: 'pick', options: ['10', '20', '25', '30', '40', '50', '60', '75'] },
      ],
      conds: ['t * p % 100 == 0'],
      answerExpr: 't * p / 100',
      wrongExprs: ['t * p / 10', 't - t * p / 100', 'p'],
      explanation: '$ {t} \\times \\frac{{p}}{100} = {t * p / 100} $',
    },
  },
  {
    id: 'triangle-area',
    name: '삼각형의 넓이',
    unit: 'e5-06-4',
    choice: false,
    template: {
      prompt: '밑변이 {b}cm, 높이가 {h}cm인 삼각형의 넓이는 몇 $\\mathrm{cm}^2$일까요?',
      vars: [
        { name: 'b', kind: 'int', min: 3, max: 20 },
        { name: 'h', kind: 'int', min: 3, max: 20 },
      ],
      conds: ['b * h % 2 == 0'],
      answerExpr: 'b * h / 2',
      wrongExprs: ['b * h', 'b + h', '2 * (b + h)'],
      explanation: '(밑변) × (높이) ÷ 2 = {b} × {h} ÷ 2 = {b * h / 2}',
    },
  },
  {
    id: 'speed',
    name: '거리·속력·시간',
    unit: 'e6-04-2',
    choice: false,
    template: {
      prompt: '{d}km를 시속 {v}km로 가면 몇 시간이 걸릴까요?',
      vars: [
        { name: 'v', kind: 'int', min: 20, max: 90, step: 10 },
        { name: 't', kind: 'int', min: 2, max: 6 },
      ],
      calc: [{ name: 'd', expr: 'v * t' }],
      answerExpr: 't',
      wrongExprs: ['t + 1', 't * 2', 'd - v'],
      explanation: '(시간) = (거리) ÷ (속력) = {d} ÷ {v} = {t}',
    },
  },
  {
    id: 'system',
    name: '연립방정식',
    unit: 'm2-04-2',
    choice: false,
    template: {
      prompt: '연립방정식 $ x + y = {s} $, $ x - y = {d} $ 에서 $ x $의 값을 구하세요.',
      vars: [
        { name: 'x', kind: 'int', min: 2, max: 20 },
        { name: 'y', kind: 'int', min: 1, max: 15 },
      ],
      conds: ['x != y'],
      calc: [{ name: 's', expr: 'x + y' }, { name: 'd', expr: 'x - y' }],
      answerExpr: 'x',
      wrongExprs: ['y', 's', 'd'],
      explanation: '두 식을 더하면 $ 2x = {s + d} $, 따라서 $ x = {x} $',
    },
  },
]
