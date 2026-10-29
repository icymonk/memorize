import type { TemplateDraft } from './template'
import { PRESETS } from './presets'

/**
 * MATH-15 내장 문제 틀: 세부 개념 code마다 우리가 만든 변형 문제 틀. 앱(미리보기)과 서버(저장)가 함께 쓴다.
 * 모두 오답 식이 있어 숫자형·객관식 둘 다 된다. 단원 범위는 docs/dev/math-plan.md M5
 */
export type LibDifficulty = 'easy' | 'normal' | 'hard'
export interface LibTemplate { id: string, unit: string, name: string, difficulty: LibDifficulty, template: TemplateDraft }

const T = (id: string, unit: string, name: string, difficulty: LibDifficulty, template: TemplateDraft): LibTemplate => ({ id, unit, name, difficulty, template })
const int = (name: string, min: number, max: number, exclude: number[] = []) => ({ name, kind: 'int' as const, min, max, exclude })
const dec = (name: string, min: number, max: number, digits = 1) => ({ name, kind: 'dec' as const, min, max, digits })

const OWN: LibTemplate[] = [
  // 초1~2
  T('e1-add', 'e1-03-2', '한 자리 수의 덧셈', 'easy', {
    prompt: '$ {a} + {b} $ 는 얼마일까요?', vars: [int('a', 1, 8), int('b', 1, 8)], conds: ['a + b <= 9'],
    answerExpr: 'a + b', wrongExprs: ['a + b + 1', 'a + b - 1', 'a + b + 2'], explanation: '{a}에서 {b}만큼 더 세면 {a+b}예요.',
  }),
  T('e1-sub', 'e1-03-3', '한 자리 수의 뺄셈', 'easy', {
    prompt: '$ {a} - {b} $ 는 얼마일까요?', vars: [int('a', 3, 9), int('b', 1, 8)], conds: ['b < a'],
    answerExpr: 'a - b', wrongExprs: ['a + b', 'a - b + 1', 'a - b - 1'], explanation: '{a}에서 {b}만큼 거꾸로 세면 {a-b}예요.',
  }),
  T('e1-carry', 'e1-07-1', '받아올림이 있는 덧셈', 'normal', {
    prompt: '$ {a} + {b} $ 를 계산하세요.', vars: [int('a', 2, 9), int('b', 2, 9)], conds: ['a + b > 10'],
    answerExpr: 'a + b', wrongExprs: ['a + b - 10', 'a + b + 1', 'a + b - 1'], hints: ['{a}에 {10-a}를 더해 10을 먼저 만들어 보세요.'],
    explanation: '{a} + {10-a} = 10, 10 + {a+b-10} = {a+b}',
  }),
  T('e1-three', 'e1-07-3', '세 수의 덧셈과 뺄셈', 'normal', {
    prompt: '$ {a} + {b} - {c} $ 를 계산하세요.', vars: [int('a', 2, 9), int('b', 2, 9), int('c', 1, 9)], conds: ['a + b >= c', 'a + b <= 18'],
    answerExpr: 'a + b - c', wrongExprs: ['a + b + c', 'a - b + c', 'a + b - c + 1'], explanation: '앞에서부터 차례로: {a} + {b} = {a+b}, {a+b} - {c} = {a+b-c}',
  }),
  T('e2-add', 'e2-03-1', '받아올림이 있는 두 자리 수 덧셈', 'normal', {
    prompt: '$ {a} + {b} $ 를 계산하세요.', vars: [int('a', 15, 79), int('b', 15, 79)], conds: ['a % 10 + b % 10 >= 10', 'a + b < 100'],
    answerExpr: 'a + b', wrongExprs: ['a + b - 10', 'a + b + 10', 'a + b + 1'], hints: ['일의 자리끼리 더한 수가 10을 넘으면 십의 자리로 1을 올려요.'],
    explanation: '일의 자리 {a%10} + {b%10} = {a%10+b%10}이므로 받아올림해서 {a+b}',
  }),
  T('e2-sub', 'e2-03-2', '받아내림이 있는 두 자리 수 뺄셈', 'normal', {
    prompt: '$ {a} - {b} $ 를 계산하세요.', vars: [int('a', 31, 99), int('b', 12, 89)], conds: ['b < a', 'a % 10 < b % 10'],
    answerExpr: 'a - b', wrongExprs: ['a - b + 10', 'a - b - 10', 'a + b'], hints: ['일의 자리에서 뺄 수 없으면 십의 자리에서 10을 빌려 와요.'],
    explanation: '받아내림하면 $ {a} - {b} = {a-b} $',
  }),
  T('e2-box', 'e2-03-4', '□가 있는 덧셈식', 'normal', {
    prompt: '$ \\square + {b} = {c} $ 일 때 □에 알맞은 수는?', vars: [int('r', 5, 50), int('b', 5, 40)], calc: [{ name: 'c', expr: 'r + b' }],
    answerExpr: 'r', wrongExprs: ['c + b', 'r + 1', 'r - 1'], explanation: '□ = {c} - {b} = {r}',
  }),
  T('e2-times', 'e2-08-1', '곱셈구구', 'easy', {
    prompt: '$ {a} \\times {b} $ 는 얼마일까요?', vars: [int('a', 2, 9), int('b', 1, 9)],
    answerExpr: 'a * b', wrongExprs: ['a * b + a', 'a * b - a', 'a + b'], explanation: '{a}단: {a}를 {b}번 더하면 {a*b}',
  }),
  // 초3~4
  T('e3-add', 'e3-01-1', '세 자리 수의 덧셈', 'normal', {
    prompt: '$ {a} + {b} $ 를 계산하세요.', vars: [int('a', 100, 899), int('b', 100, 899)], conds: ['a + b < 1000'],
    answerExpr: 'a + b', wrongExprs: ['a + b - 10', 'a + b + 100', 'a + b - 100'], explanation: '자리별로 더하면 {a+b}',
  }),
  T('e3-div', 'e3-03-3', '나눗셈의 몫', 'easy', {
    prompt: '$ {c} \\div {a} $ 의 몫은?', vars: [int('a', 2, 9), int('r', 2, 9)], calc: [{ name: 'c', expr: 'a * r' }],
    answerExpr: 'r', wrongExprs: ['r + 1', 'r - 1', 'c - a'], explanation: '$ {a} \\times {r} = {c} $ 이므로 몫은 {r}',
  }),
  T('e3-mul', 'e3-04-1', '(두 자리 수)×(한 자리 수)', 'normal', {
    prompt: '$ {a} \\times {b} $ 를 계산하세요.', vars: [int('a', 12, 99), int('b', 2, 9)],
    answerExpr: 'a * b', wrongExprs: ['a * b + b', 'a * b - b', 'a * b + 10'], explanation: '$ {a} \\times {b} = {a*b} $',
  }),
  T('e3-rem', 'e3-08-1', '나머지가 있는 나눗셈', 'normal', {
    prompt: '$ {c} \\div {a} $ 의 나머지를 구하세요.', vars: [int('a', 3, 9), int('q', 2, 12), int('m', 1, 8)], conds: ['m < a'],
    calc: [{ name: 'c', expr: 'a * q + m' }], answerExpr: 'm', wrongExprs: ['q', 'm + 1', 'a - m'],
    hints: ['{a}단에서 {c}보다 크지 않은 가장 큰 수를 찾아보세요.'], explanation: '$ {c} = {a} \\times {q} + {m} $ 이므로 나머지는 {m}',
  }),
  T('e3-mixed', 'e3-10-2', '대분수를 가분수로', 'normal', {
    prompt: '$ {w}\\frac{{p}}{{d}} $ 를 가분수로 나타낼 때 분자는?', vars: [int('w', 1, 5), int('d', 2, 9), int('p', 1, 8)], conds: ['p < d'],
    answerExpr: 'w * d + p', wrongExprs: ['w + p', 'w * p + d', 'w * d'], explanation: '$ {w} \\times {d} + {p} = {w*d+p} $, 가분수는 $ \\frac{{w*d+p}}{{d}} $',
  }),
  T('e4-mul', 'e4-03-1', '(세 자리 수)×(두 자리 수)', 'hard', {
    prompt: '$ {a} \\times {b} $ 를 계산하세요.', vars: [int('a', 100, 999), int('b', 11, 99)],
    answerExpr: 'a * b', wrongExprs: ['a * b + a', 'a * b - a', 'a * (b + 10)'], explanation: '$ {a} \\times {b} = {a*b} $',
  }),
  T('e4-div', 'e4-03-2', '(세 자리 수)÷(두 자리 수)', 'normal', {
    prompt: '$ {c} \\div {b} $ 의 몫은?', vars: [int('b', 11, 50), int('q', 2, 30)], calc: [{ name: 'c', expr: 'b * q' }], conds: ['c >= 100', 'c < 1000'],
    answerExpr: 'q', wrongExprs: ['q + 1', 'q - 1', 'q * 10'], explanation: '$ {b} \\times {q} = {c} $',
  }),
  T('e4-frac-add', 'e4-07-1', '분모가 같은 분수의 덧셈', 'easy', {
    prompt: '$ \\frac{{p}}{{d}} + \\frac{{q}}{{d}} $ 를 계산하세요.', vars: [int('d', 3, 12), int('p', 1, 10), int('q', 1, 10)], conds: ['p + q < d'],
    answerExpr: '(p + q) / d', wrongExprs: ['(p + q) / (2 * d)', 'p * q / d', '(p + q + 1) / d'], explanation: '분모는 그대로, 분자끼리 더해요: $ \\frac{{p+q}}{{d}} $',
  }),
  T('e4-dec-add', 'e4-09-3', '소수의 덧셈', 'easy', {
    prompt: '$ {a} + {b} $ 를 계산하세요.', vars: [dec('a', 0.1, 9.9), dec('b', 0.1, 9.9)],
    answerExpr: 'a + b', wrongExprs: ['a + b + 0.1', 'a + b - 0.1', 'a + b + 1'], explanation: '소수점을 맞춰 더하면 {a+b}',
  }),
  T('e4-angle', 'e4-02-3', '삼각형의 세 각', 'normal', {
    prompt: '삼각형의 두 각이 $ {a}^\\circ $, $ {b}^\\circ $ 일 때 나머지 한 각의 크기(°)는?', vars: [int('a', 20, 90), int('b', 20, 90)], conds: ['a + b < 170'],
    answerExpr: '180 - a - b', wrongExprs: ['360 - a - b', '180 - a', 'a + b'], hints: ['삼각형의 세 각의 합은 180°예요.'],
    explanation: '$ 180 - {a} - {b} = {180-a-b} $',
  }),
  // 초5
  T('e5-mix', 'e5-01-2', '괄호가 있는 혼합 계산', 'normal', {
    prompt: '$ {a} + {b} \\times ({c} - {d}) $ 를 계산하세요.', vars: [int('a', 2, 30), int('b', 2, 9), int('c', 5, 15), int('d', 1, 9)], conds: ['c > d'],
    answerExpr: 'a + b * (c - d)', wrongExprs: ['(a + b) * (c - d)', 'a + b * c - d', 'a * b + c - d'], hints: ['괄호 안 → 곱셈 → 덧셈 순서로 계산해요.'],
    explanation: '괄호: {c-d}, 곱셈: {b*(c-d)}, 덧셈: {a+b*(c-d)}',
  }),
  T('e5-gcd', 'e5-02-3', '최대공약수', 'normal', {
    prompt: '{a}와 {b}의 최대공약수를 구하세요.', vars: [int('g', 2, 12), int('x', 2, 9), int('y', 2, 9)], conds: ['x < y', 'gcd(x, y) == 1'],
    calc: [{ name: 'a', expr: 'g * x' }, { name: 'b', expr: 'g * y' }], answerExpr: 'g', wrongExprs: ['lcm(a, b)', 'g * x', 'b - a + g'],
    explanation: '{a} = {g} × {x}, {b} = {g} × {y}이므로 최대공약수는 {g}',
  }),
  T('e5-lcm', 'e5-02-4', '최소공배수', 'normal', {
    prompt: '{a}와 {b}의 최소공배수를 구하세요.', vars: [int('g', 2, 6), int('x', 2, 7), int('y', 2, 7)], conds: ['x < y', 'gcd(x, y) == 1'],
    calc: [{ name: 'a', expr: 'g * x' }, { name: 'b', expr: 'g * y' }], answerExpr: 'lcm(a, b)', wrongExprs: ['a * b', 'g', 'lcm(a, b) + g'],
    explanation: '최대공약수 {g} × {x} × {y} = {lcm(a,b)}',
  }),
  T('e5-reduce', 'e5-04-2', '약분', 'normal', {
    prompt: '$ \\frac{{a}}{{b}} $ 를 기약분수로 나타낼 때 분모는?', vars: [int('p', 1, 8), int('q', 2, 9), int('k', 2, 6)], conds: ['p < q', 'gcd(p, q) == 1'],
    calc: [{ name: 'a', expr: 'p * k' }, { name: 'b', expr: 'q * k' }], answerExpr: 'q', wrongExprs: ['b', 'k', 'q + k'],
    explanation: '분모와 분자를 {k}로 나누면 $ \\frac{{p}}{{q}} $',
  }),
  T('e5-frac-sub', 'e5-05-2', '분모가 다른 분수의 뺄셈', 'normal', {
    prompt: '$ \\frac{{p}}{{a}} - \\frac{{q}}{{b}} $ 를 계산하세요.', vars: [int('a', 2, 9), int('b', 2, 9), int('p', 1, 8), int('q', 1, 8)],
    conds: ['a != b', 'p < a', 'q < b', 'p * b > q * a'],
    answerExpr: 'p / a - q / b', wrongExprs: ['(p - q) / (a * b)', 'p / a + q / b', '(p * b - q * a) / (a + b)'], hints: ['두 분모의 공배수로 통분해 보세요.'],
    explanation: '통분하면 $ \\frac{{p*b}}{{a*b}} - \\frac{{q*a}}{{a*b}} = {p/a-q/b} $',
  }),
  T('e5-round', 'e5-07-2', '반올림', 'easy', {
    prompt: '{n}을 반올림하여 백의 자리까지 나타내세요.', vars: [int('n', 1001, 9999)], conds: ['n % 100 != 50'],
    answerExpr: 'round(n / 100) * 100', wrongExprs: ['floor(n / 100) * 100 + 100 * (1 - floor(n % 100 / 50))', 'round(n / 1000) * 1000', 'round(n / 10) * 10'],
    explanation: '십의 자리 숫자가 5 이상이면 올리고, 4 이하면 버려요.',
  }),
  T('e5-frac-mul', 'e5-08-3', '(분수)×(분수)', 'normal', {
    prompt: '$ \\frac{{p}}{{a}} \\times \\frac{{q}}{{b}} $ 를 계산하세요.', vars: [int('a', 2, 9), int('b', 2, 9), int('p', 1, 8), int('q', 1, 8)], conds: ['p < a', 'q < b'],
    answerExpr: 'p / a * q / b', wrongExprs: ['(p * q) / (a + b)', '(p + q) / (a * b)', 'p / a + q / b'], explanation: '분자끼리, 분모끼리 곱해요: {p/a*q/b}',
  }),
  T('e5-dec-mul', 'e5-10-2', '(소수)×(소수)', 'normal', {
    prompt: '$ {a} \\times {b} $ 를 계산하세요.', vars: [dec('a', 0.2, 9.9), dec('b', 0.2, 9.9)],
    answerExpr: 'a * b', wrongExprs: ['a * b * 10', 'a * b / 10', 'a + b'], hints: ['자연수처럼 곱한 뒤 소수점 아래 자리 수를 더해 소수점을 찍어요.'],
    explanation: '$ {a} \\times {b} = {a*b} $',
  }),
  T('e5-rect', 'e5-06-2', '직사각형의 넓이', 'easy', {
    prompt: '가로 {w} cm, 세로 {h} cm인 직사각형의 넓이(cm²)는?', vars: [int('w', 3, 20), int('h', 3, 20)], conds: ['w != h'],
    answerExpr: 'w * h', wrongExprs: ['2 * (w + h)', 'w + h', 'w * h * 2'], explanation: '가로 × 세로 = {w} × {h} = {w*h}',
  }),
  T('e5-trap', 'e5-06-5', '사다리꼴의 넓이', 'normal', {
    prompt: '윗변 {a} cm, 아랫변 {b} cm, 높이 {h} cm인 사다리꼴의 넓이(cm²)는?', vars: [int('a', 2, 12), int('b', 3, 15), int('h', 2, 12)], conds: ['a < b', '(a + b) * h % 2 == 0'],
    answerExpr: '(a + b) * h / 2', wrongExprs: ['(a + b) * h', 'a * b * h / 2', 'b * h / 2'], hints: ['(윗변 + 아랫변) × 높이 ÷ 2'],
    explanation: '({a} + {b}) × {h} ÷ 2 = {(a+b)*h/2}',
  }),
  T('e5-avg', 'e5-12-1', '평균', 'normal', {
    prompt: '세 번의 점수가 {a}점, {b}점, {c}점일 때 평균은 몇 점일까요?', vars: [int('a', 50, 100), int('b', 50, 100), int('c', 50, 100)], conds: ['(a + b + c) % 3 == 0'],
    answerExpr: '(a + b + c) / 3', wrongExprs: ['a + b + c', '(a + b + c) / 3 + 1', '(a + c) / 2'], explanation: '({a} + {b} + {c}) ÷ 3 = {(a+b+c)/3}',
  }),
  // 초6
  T('e6-frac-div-n', 'e6-01-2', '(분수)÷(자연수)', 'normal', {
    prompt: '$ \\frac{{p}}{{a}} \\div {n} $ 을 계산하세요.', vars: [int('a', 2, 9), int('p', 1, 8), int('n', 2, 6)], conds: ['p < a'],
    answerExpr: 'p / a / n', wrongExprs: ['p / a * n', 'p / (a + n)', 'n / a'], explanation: '$ \\frac{{p}}{{a}} \\times \\frac{1}{{n}} = {p/a/n} $',
  }),
  T('e6-frac-div', 'e6-07-1', '(분수)÷(분수)', 'hard', {
    prompt: '$ \\frac{{p}}{{a}} \\div \\frac{{q}}{{b}} $ 를 계산하세요.', vars: [int('a', 2, 9), int('b', 2, 9), int('p', 1, 8), int('q', 1, 8)], conds: ['p < a', 'q < b', 'p * b != q * a'],
    answerExpr: '(p / a) / (q / b)', wrongExprs: ['(p / a) * (q / b)', '(q / b) / (p / a)', '(p * q) / (a + b)'], hints: ['나누는 분수의 분모와 분자를 바꿔 곱해요.'],
    explanation: '$ \\frac{{p}}{{a}} \\times \\frac{{b}}{{q}} = {(p/a)/(q/b)} $',
  }),
  T('e6-dec-div', 'e6-08-1', '(소수)÷(소수)', 'normal', {
    prompt: '$ {c} \\div {b} $ 를 계산하세요.', vars: [dec('b', 0.2, 2.5), int('r', 2, 9)], calc: [{ name: 'c', expr: 'b * r' }],
    answerExpr: 'r', wrongExprs: ['r * 10', 'r / 10', 'r + 1'], hints: ['나누는 수와 나눠지는 수에 똑같이 10을 곱해 보세요.'],
    explanation: '$ {c*10} \\div {b*10} = {r} $',
  }),
  T('e6-share', 'e6-10-3', '비례배분', 'normal', {
    prompt: '{t}개를 {a} : {b}로 나누면 앞쪽은 몇 개일까요?', vars: [int('a', 1, 7), int('b', 1, 7), int('k', 2, 12)], conds: ['a != b', 'gcd(a, b) == 1'],
    calc: [{ name: 't', expr: 'k * (a + b)' }], answerExpr: 't * a / (a + b)', wrongExprs: ['t * b / (a + b)', 't / a', 't - a'],
    explanation: '{t} × $ \\frac{{a}}{{a+b}} $ = {t*a/(a+b)}',
  }),
  T('e6-circle', 'e6-11-2', '원의 넓이', 'normal', {
    prompt: '반지름이 {r} cm인 원의 넓이(cm²)는? (원주율 3.14)', vars: [int('r', 2, 10)],
    answerExpr: '3.14 * r * r', wrongExprs: ['3.14 * 2 * r', '3.14 * r', 'r * r'], explanation: '반지름 × 반지름 × 3.14 = {3.14*r*r}',
  }),
  T('e6-box', 'e6-06-2', '직육면체의 부피', 'easy', {
    prompt: '가로 {a} cm, 세로 {b} cm, 높이 {c} cm인 직육면체의 부피(cm³)는?', vars: [int('a', 2, 12), int('b', 2, 12), int('c', 2, 12)],
    answerExpr: 'a * b * c', wrongExprs: ['2 * (a * b + b * c + a * c)', 'a + b + c', 'a * b'], explanation: '{a} × {b} × {c} = {a*b*c}',
  }),
  // 중1
  T('m1-int-add', 'm1-02-3', '정수의 덧셈', 'easy', {
    prompt: '$ ({a}) + ({b}) $ 를 계산하세요.', vars: [int('a', -20, 20, [0]), int('b', -20, 20, [0])], conds: ['a < 0 || b < 0'],
    answerExpr: 'a + b', wrongExprs: ['a - b', '-(a + b)', 'abs(a) + abs(b)'], explanation: '{a+b}',
  }),
  T('m1-int-mul', 'm1-02-4', '정수의 곱셈', 'easy', {
    prompt: '$ ({a}) \\times ({b}) $ 를 계산하세요.', vars: [int('a', -12, 12, [0, 1, -1]), int('b', -12, 12, [0, 1, -1])], conds: ['a < 0 || b < 0'],
    answerExpr: 'a * b', wrongExprs: ['-(a * b)', 'a + b', 'a * b + a'], hints: ['음수를 몇 번 곱했는지 세어 부호를 먼저 정해요.'],
    explanation: '부호를 정하고 절댓값끼리 곱하면 {a*b}',
  }),
  T('m1-power', 'm1-01-2', '거듭제곱', 'easy', {
    prompt: '$ {a}^{{n}} $ 의 값은?', vars: [int('a', 2, 5), int('n', 2, 4)],
    answerExpr: 'a ^ n', wrongExprs: ['a * n', 'a ^ (n + 1)', 'n ^ a'], explanation: '{a}를 {n}번 곱하면 {a^n}',
  }),
  T('m1-expr-value', 'm1-03-2', '식의 값', 'normal', {
    prompt: '$ x = {x} $ 일 때 $ {a}x - {b} $ 의 값은?', vars: [int('x', -5, 5, [0]), int('a', 2, 9), int('b', 1, 9)],
    answerExpr: 'a * x - b', wrongExprs: ['a * x + b', 'a + x - b', '-a * x - b'], explanation: '$ {a} \\times ({x}) - {b} = {a*x-b} $',
  }),
  T('m1-linear-word', 'm1-04-4', '일차방정식의 활용', 'normal', {
    prompt: '어떤 수에 {a}를 곱하고 {b}를 더했더니 {c}가 되었습니다. 어떤 수는?', vars: [int('a', 2, 9), int('b', 1, 30), int('r', 1, 20)],
    calc: [{ name: 'c', expr: 'a * r + b' }], answerExpr: 'r', wrongExprs: ['(c + b) / a', 'c - b', 'r + 1'],
    hints: ['어떤 수를 x라 하고 식을 세워 보세요: $ {a}x + {b} = {c} $'], explanation: '$ {a}x + {b} = {c} $, $ x = {r} $',
  }),
  T('m1-direct', 'm1-05-3', '정비례', 'normal', {
    prompt: 'y가 x에 정비례하고 $ x = {x1} $ 일 때 $ y = {y1} $ 입니다. $ x = {x2} $ 일 때 y의 값은?', vars: [int('k', 2, 9), int('x1', 1, 9), int('x2', 2, 12)], conds: ['x1 != x2'],
    calc: [{ name: 'y1', expr: 'k * x1' }], answerExpr: 'k * x2', wrongExprs: ['y1 + x2', 'k * x2 + k', 'y1 * x2'], explanation: '$ y = {k}x $ 이므로 {k*x2}',
  }),
  T('m1-polygon', 'm1-08-1', '정다각형의 한 내각', 'hard', {
    prompt: '정{n}각형의 한 내각의 크기(°)는?', vars: [int('n', 3, 12)], conds: ['360 % n == 0'],
    answerExpr: '180 * (n - 2) / n', wrongExprs: ['180 * (n - 2)', '360 / n', '180 - n'], hints: ['n각형의 내각의 합은 180° × (n - 2)예요.'],
    explanation: '$ 180 \\times {n-2} \\div {n} = {180*(n-2)/n} $',
  }),
  // 중2
  T('m2-exp', 'm2-02-1', '지수법칙', 'easy', {
    prompt: '$ x^{{a}} \\times x^{{b}} = x^{\\square} $ 일 때 □에 알맞은 수는?', vars: [int('a', 2, 9), int('b', 2, 9)],
    answerExpr: 'a + b', wrongExprs: ['a * b', 'a + b + 1', 'a ^ b'], explanation: '밑이 같으면 지수끼리 더해요: {a+b}',
  }),
  T('m2-ineq', 'm2-03-3', '일차부등식의 풀이', 'normal', {
    prompt: '부등식 $ {a}x + {b} > {c} $ 의 해가 $ x > \\square $ 일 때 □에 알맞은 수는?', vars: [int('a', 2, 9), int('b', 1, 20), int('r', -9, 9)],
    calc: [{ name: 'c', expr: 'a * r + b' }], answerExpr: 'r', wrongExprs: ['-r', 'r + 1', '(c + b) / a'], explanation: '$ {a}x > {c-b} $, $ x > {r} $',
  }),
  T('m2-slope', 'm2-05-3', '두 점을 지나는 직선의 기울기', 'normal', {
    prompt: '두 점 $ ({x1}, {y1}) $, $ ({x2}, {y2}) $ 를 지나는 직선의 기울기는?', vars: [int('m', -5, 5, [0]), int('x1', -5, 5), int('d', 1, 5), int('y1', -9, 9)],
    calc: [{ name: 'x2', expr: 'x1 + d' }, { name: 'y2', expr: 'y1 + m * d' }], answerExpr: 'm', wrongExprs: ['-m', '1 / m', 'y2 - y1'],
    hints: ['기울기 = (y의 값의 증가량) ÷ (x의 값의 증가량)'], explanation: '$ \\frac{{y2-y1}}{{d}} = {m} $',
  }),
  T('m2-pythagoras', 'm2-09-1', '피타고라스 정리', 'normal', {
    prompt: '직각삼각형의 직각을 낀 두 변이 {a}, {b}일 때 빗변의 길이는?', vars: [int('p', 2, 5), int('q', 1, 4), int('k', 1, 3)], conds: ['p > q', 'gcd(p, q) == 1', '(p - q) % 2 == 1'],
    calc: [{ name: 'a', expr: 'k * (p * p - q * q)' }, { name: 'b', expr: 'k * 2 * p * q' }, { name: 'c', expr: 'k * (p * p + q * q)' }],
    answerExpr: 'c', wrongExprs: ['a + b', 'c + 1', 'abs(a - b) + c'], hints: ['$ c^2 = a^2 + b^2 $'], explanation: '$ \\sqrt{{a*a+b*b}} = {c} $',
  }),
  T('m2-prob', 'm2-10-3', '확률의 계산', 'normal', {
    prompt: '1부터 {n}까지의 수가 적힌 카드 중 한 장을 뽑을 때 {k}의 배수가 나올 확률은?', vars: [int('n', 10, 30), int('k', 2, 6)],
    answerExpr: 'floor(n / k) / n', wrongExprs: ['k / n', '1 / k', 'floor(n / k) / (n + 1)'], explanation: '{k}의 배수는 {floor(n/k)}개이므로 {floor(n/k)/n}',
  }),
  // 중3
  T('m3-root', 'm3-01-3', '근호를 포함한 곱셈', 'normal', {
    prompt: '$ \\sqrt{{k}} \\times \\sqrt{{b}} $ 를 계산하세요.', vars: [{ name: 'k', kind: 'pick', options: ['2', '3', '5', '6', '7'] }, int('p', 2, 9)],
    calc: [{ name: 'b', expr: 'k * p * p' }], answerExpr: 'k * p', wrongExprs: ['p', 'k + p', 'k * p * p'], explanation: '$ \\sqrt{{k*b}} = {k*p} $',
  }),
  T('m3-quad', 'm3-03-2', '인수분해를 이용한 이차방정식', 'normal', {
    prompt: '이차방정식 $ x^2 - {s}x + {q} = 0 $ 의 두 근 중 큰 것은?', vars: [int('r1', 1, 9), int('r2', 1, 9)], conds: ['r1 < r2'],
    calc: [{ name: 's', expr: 'r1 + r2' }, { name: 'q', expr: 'r1 * r2' }], answerExpr: 'r2', wrongExprs: ['r1', 's', 'q'],
    hints: ['곱해서 {q}, 더해서 {s}가 되는 두 수를 찾아보세요.'], explanation: '$ (x - {r1})(x - {r2}) = 0 $',
  }),
  T('m3-vertex', 'm3-04-3', '이차함수의 꼭짓점', 'easy', {
    prompt: '$ y = {a}(x - {p})^2 + {q} $ 의 그래프의 꼭짓점의 y좌표는?', vars: [int('a', 2, 5), int('p', 1, 9), int('q', 1, 9)], conds: ['p != q'],
    answerExpr: 'q', wrongExprs: ['p', '-q', 'a + q'], explanation: '꼭짓점은 $ ({p}, {q}) $',
  }),
  // 고1
  T('h1-remainder', 'h1-02-2', '나머지정리', 'normal', {
    prompt: '$ P(x) = x^2 + {a}x + {b} $ 를 $ x - {c} $ 로 나눈 나머지는?', vars: [int('a', 1, 9), int('b', 1, 9), int('c', 1, 5)],
    answerExpr: 'c * c + a * c + b', wrongExprs: ['c * c + a * c', 'b', 'c * c - a * c + b'], hints: ['나머지는 $ P({c}) $ 예요.'],
    explanation: '$ P({c}) = {c*c+a*c+b} $',
  }),
  T('h1-vieta', 'h1-03-3', '근과 계수의 관계', 'hard', {
    prompt: '$ x^2 - {s}x + {p} = 0 $ 의 두 근을 $ \\alpha, \\beta $ 라 할 때 $ \\alpha^2 + \\beta^2 $ 의 값은?', vars: [int('s', 2, 9), int('p', 1, 9)],
    answerExpr: 's * s - 2 * p', wrongExprs: ['s * s + 2 * p', 's * s', 's - 2 * p'], hints: ['$ \\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta $'],
    explanation: '$ {s}^2 - 2 \\times {p} = {s*s-2*p} $',
  }),
  T('h1-perm', 'h1-06-2', '순열', 'normal', {
    prompt: '{n}명 중 2명을 뽑아 반장과 부반장을 정하는 경우의 수는?', vars: [int('n', 3, 12)],
    answerExpr: 'n * (n - 1)', wrongExprs: ['n * (n - 1) / 2', 'n * n', 'n * 2'], explanation: '$ {n} \\times {n-1} = {n*(n-1)} $',
  }),
  T('h1-comb', 'h1-06-3', '조합', 'normal', {
    prompt: '{n}명 중 대표 2명을 뽑는 경우의 수는?', vars: [int('n', 4, 12)],
    answerExpr: 'n * (n - 1) / 2', wrongExprs: ['n * (n - 1)', 'n * 2', 'n * (n - 1) / 2 + n'], hints: ['순서가 없으므로 순열을 2로 나눠요.'],
    explanation: '$ \\frac{{n} \\times {n-1}}{2} = {n*(n-1)/2} $',
  }),
  T('h1-dist', 'h1-08-1', '두 점 사이의 거리', 'normal', {
    prompt: '두 점 $ ({x1}, {y1}) $, $ ({x1+a}, {y1+b}) $ 사이의 거리는?', vars: [int('p', 2, 4), int('q', 1, 3), int('x1', -5, 5), int('y1', -5, 5)], conds: ['p > q', 'gcd(p, q) == 1', '(p - q) % 2 == 1'],
    calc: [{ name: 'a', expr: 'p * p - q * q' }, { name: 'b', expr: '2 * p * q' }], answerExpr: 'p * p + q * q', wrongExprs: ['a + b', 'a * a + b * b', 'p * p + q * q + 1'],
    explanation: '$ \\sqrt{{a}^2 + {b}^2} = {p*p+q*q} $',
  }),
]

const PRESET_DIFFICULTY: Record<string, LibDifficulty> = { system: 'hard' }
export const LIBRARY: LibTemplate[] = [
  ...PRESETS.map(p => T(`preset-${p.id}`, p.unit, p.name, PRESET_DIFFICULTY[p.id] ?? 'normal', p.template)),
  ...OWN,
]

/** 단원 code(또는 세부 개념 code)에 붙은 내장 틀. 단원을 고르면 그 아래 세부 개념 틀도 모두 */
export const libraryFor = (code: string) => LIBRARY.filter(t => t.unit === code || t.unit.startsWith(`${code}-`))
export const libraryById = (id: string) => LIBRARY.find(t => t.id === id)
