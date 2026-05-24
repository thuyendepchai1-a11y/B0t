import {
  Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder,
  REST, Routes, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
import pg from 'pg';
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ✅ FIX: Trỏ đúng worker file cho Node.js (ES Module / CommonJS compatible)
const __dirname = dirname(fileURLToPath(import.meta.url));
pdfjsLib.GlobalWorkerOptions.workerSrc = join(
  process.cwd(),
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
);

dotenv.config();

// ==================== CẤU HÌNH MÔI TRƯỜNG & HẰNG SỐ ====================
const TOKEN             = process.env.DISCORD_TOKEN;
const CLIENT_ID         = process.env.CLIENT_ID;
const GUILD_ID          = process.env.GUILD_ID;
const RESULT_CHANNEL_ID = process.env.RESULT_CHANNEL_ID || null;
const COUNTDOWN_CHANNEL_ID  = '1494586446672302095';
const PDF_DUMP_CHANNEL_ID   = process.env.PDF_DUMP_CHANNEL_ID || COUNTDOWN_CHANNEL_ID;
const TIMEZONE          = 'Asia/Ho_Chi_Minh';

const VOICE_START_TIME  = process.env.VOICE_START_TIME || '20:00';
const VOICE_END_TIME    = process.env.VOICE_END_TIME   || '01:30';
const RESET_TIME        = process.env.RESET_TIME       || VOICE_END_TIME;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Thiếu DISCORD_TOKEN, CLIENT_ID hoặc GUILD_ID trong Variables');
  process.exit(1);
}

// ==================== PALETTE MÀU CHUẨN ====================
const COLORS = {
  PRIMARY:    0x5865f2,
  SUCCESS:    0x57f287,
  WARNING:    0xfee75c,
  DANGER:     0xed4245,
  INFO:       0x3ba55d,
  DARK:       0x2b2d31,
  GOLD:       0xffd700,
  SILVER:     0xc0c0c0,
  BRONZE:     0xcd7f32,
  ORANGE:     0xf47fff,
};

// ==================== QUIZ CONFIG ====================
const QUIZ_CONFIG = {
  POINTS_CORRECT: 10,
  POINTS_SPEED_BONUS: 5,
  SPEED_THRESHOLD_MS: 10000,
  STREAK_BONUS: [
    { streak: 3,  bonus: 3 },
    { streak: 5,  bonus: 5 },
    { streak: 10, bonus: 10 },
    { streak: 20, bonus: 25 },
    { streak: 50, bonus: 50 },
  ],
  RANK_TIERS: [
    { name: '🥉 Đồng',        min: 0,    color: COLORS.BRONZE, roleColor: 0xcd7f32 },
    { name: '🥈 Bạc',         min: 50,   color: COLORS.SILVER, roleColor: 0xc0c0c0 },
    { name: '🥇 Vàng',        min: 100,  color: COLORS.GOLD,   roleColor: 0xffd700 },
    { name: '💎 Bạch Kim',    min: 200,  color: 0xe5e4e2,      roleColor: 0xe5e4e2 },
    { name: '🌟 Kim Cương',   min: 350,  color: 0xb9f2ff,      roleColor: 0xb9f2ff },
    { name: '👑 Cao Thủ',     min: 500,  color: 0xff4500,      roleColor: 0xff4500 },
    { name: '🔥 Bán Chuyên',  min: 700,  color: 0x9932cc,      roleColor: 0x9932cc },
    { name: '⚡ Chuyên Gia',  min: 900,  color: 0x00ced1,      roleColor: 0x00ced1 },
    { name: '🌙 Huyền Thoại', min: 1200, color: 0xffd700,      roleColor: 0xffd700 },
    { name: '🌌 Thần Thánh',  min: 1500, color: 0xff0000,      roleColor: 0xff0000 },
  ],
  ACHIEVEMENTS: [
    { id: 'first_blood',    name: '🩸 First Blood',      desc: 'Trả lời đúng câu đầu tiên' },
    { id: 'streak_3',       name: '🔥 Chuỗi 3',          desc: 'Đúng 3 câu liên tiếp' },
    { id: 'streak_5',       name: '⚡ Chuỗi 5',          desc: 'Đúng 5 câu liên tiếp' },
    { id: 'streak_10',      name: '🌟 Chuỗi 10',         desc: 'Đúng 10 câu liên tiếp' },
    { id: 'streak_20',      name: '👑 Chuỗi 20',         desc: 'Đúng 20 câu liên tiếp' },
    { id: 'streak_50',      name: '💀 Bất Tử',           desc: 'Đúng 50 câu liên tiếp' },
    { id: 'master_100',     name: '🎯 Tân Binh',         desc: 'Đạt 100 điểm' },
    { id: 'master_300',     name: '🏅 Chiến Binh',       desc: 'Đạt 300 điểm' },
    { id: 'master_500',     name: '🏆 Bậc Thầy',         desc: 'Đạt 500 điểm' },
    { id: 'master_1000',    name: '💎 Huyền Thoại',      desc: 'Đạt 1000 điểm' },
    { id: 'master_1500',    name: '🔱 Vô Cực',           desc: 'Đạt 1500 điểm' },
    { id: 'speed_demon',    name: '⚡ Tia Chớp',         desc: 'Trả lời đúng trong 10 giây' },
    { id: 'accuracy_50',    name: '🎯 Độ Chính Xác 50%', desc: 'Tỷ lệ đúng trên 50% (tối thiểu 20 câu)' },
    { id: 'accuracy_80',    name: '🎯 Độ Chính Xác 80%', desc: 'Tỷ lệ đúng trên 80% (tối thiểu 20 câu)' },
    { id: 'accuracy_100',   name: '💯 Hoàn Hảo',         desc: 'Tỷ lệ đúng 100% (tối thiểu 20 câu)' },
    { id: 'perfection_10',  name: '🌟 Khởi Đầu Hoàn Hảo', desc: 'Đúng 10 câu đầu tiên không sai' },
    { id: 'perfection_50',  name: '👑 Thánh Nhân',       desc: 'Đúng 50 câu đầu tiên không sai' },
    { id: 'veteran_10',     name: '📚 Tập Sự',           desc: 'Trả lời 10 câu hỏi' },
    { id: 'veteran_50',     name: '📖 Học Giả',          desc: 'Trả lời 50 câu hỏi' },
    { id: 'veteran_100',    name: '📜 Cựu Chiến Binh',   desc: 'Trả lời 100 câu hỏi' },
    { id: 'veteran_500',    name: '🧠 Bách Khoa',        desc: 'Trả lời 500 câu hỏi' },
    { id: 'early_bird',     name: '🐦 Chim Sớm',         desc: 'Trả lời đúng câu hỏi trước 8h sáng' },
    { id: 'night_owl',      name: '🦉 Cú Đêm',           desc: 'Trả lời đúng câu hỏi sau 10h tối' },
  ]
};

// ==================== DATA CỐ ĐỊNH ====================
const EXAMS = [
  { name: 'Kỳ thi Đánh giá Năng Lực (VACT) - Đợt 2', date: new Date('2026-05-24T08:30:00+07:00') },
  { name: 'Kỳ thi Tốt nghiệp THPT Quốc Gia 2026',    date: new Date('2026-06-11T07:30:00+07:00') }
];

const ENGLISH_TIPS = [
  {
    en:   '"Never give up on your dreams, no matter how difficult things get."',
    vi:   'Đừng bao giờ từ bỏ ước mơ, dù mọi thứ có khó khăn đến đâu.',
    tag:  'Phrasal Verb',
    note: 'give up (on sth) = từ bỏ. Trái nghĩa: keep going / persist.'
  },
  {
    en:   '"You need to keep up with the latest knowledge if you want to stand out."',
    vi:   'Bạn cần theo kịp kiến thức mới nhất nếu muốn nổi bật.',
    tag:  'Phrasal Verb',
    note: 'keep up with = theo kịp | stand out = nổi bật, khác biệt.'
  },
  {
    en:   '"I am looking forward to seeing the results of all my hard work."',
    vi:   'Tôi đang mong chờ được thấy kết quả của tất cả công sức của mình.',
    tag:  'Phrasal Verb',
    note: 'look forward to + V-ing (không dùng to V). Cấu trúc hay bị nhầm trong thi!'
  },
  {
    en:   '"Stop putting off your revision — the exam is just around the corner."',
    vi:   'Hãy ngừng trì hoãn việc ôn bài — kỳ thi đã gần kề rồi.',
    tag:  'Phrasal Verb',
    note: 'put off + V-ing = trì hoãn. "just around the corner" = sắp đến nơi.'
  },
  {
    en:   '"She had to go through many hardships before she finally succeeded."',
    vi:   'Cô ấy phải trải qua nhiều gian khó trước khi cuối cùng thành công.',
    tag:  'Phrasal Verb',
    note: 'go through = trải qua (khó khăn, thử thách). go through + noun.'
  },
  {
    en:   '"Extra practice can make up for the time you lost earlier."',
    vi:   'Luyện tập thêm có thể bù đắp cho thời gian bạn đã lãng phí trước đó.',
    tag:  'Phrasal Verb',
    note: 'make up for sth = bù đắp, bù lại cho điều gì đó.'
  },
  {
    en:   '"It is never too late to catch up with your classmates if you work smart."',
    vi:   'Không bao giờ là quá muộn để bắt kịp các bạn cùng lớp nếu bạn học đúng cách.',
    tag:  'Phrasal Verb',
    note: 'catch up with = bắt kịp. "It is never too late to + V" — cấu trúc phổ biến.'
  },
  {
    en:   '"He decided to take up a new language to broaden his horizons."',
    vi:   'Anh ấy quyết định bắt đầu học một ngôn ngữ mới để mở rộng tầm nhìn.',
    tag:  'Phrasal Verb',
    note: 'take up = bắt đầu một thói quen/sở thích mới. broaden horizons = collocation.'
  },
  {
    en:   '"They came up with a creative solution to the problem together."',
    vi:   'Họ cùng nhau nghĩ ra một giải pháp sáng tạo cho vấn đề.',
    tag:  'Phrasal Verb',
    note: 'come up with = nghĩ ra, đề xuất (ý tưởng/giải pháp).'
  },
  {
    en:   '"Do not turn down any opportunity to learn something new."',
    vi:   'Đừng từ chối bất kỳ cơ hội nào để học điều gì đó mới.',
    tag:  'Phrasal Verb',
    note: 'turn down = từ chối (lời đề nghị, cơ hội). Khác với refuse (dùng cho request).'
  },
  {
    en:   '"You can get over any obstacle if you believe in yourself."',
    vi:   'Bạn có thể vượt qua bất kỳ trở ngại nào nếu bạn tin vào bản thân.',
    tag:  'Phrasal Verb',
    note: 'get over = vượt qua (khó khăn, nỗi đau). believe in yourself = tin vào bản thân.'
  },
  {
    en:   '"Do not run out of time during the exam — manage it wisely."',
    vi:   'Đừng để hết thời gian trong kỳ thi — hãy quản lý thời gian khôn ngoan.',
    tag:  'Phrasal Verb',
    note: 'run out of = hết (thứ gì đó). run out of time/money/energy.'
  },
  {
    en:   '"Make progress every single day, even if the steps are small."',
    vi:   'Hãy tiến bộ mỗi ngày, dù những bước tiến chỉ nhỏ thôi.',
    tag:  'Collocation',
    note: 'make progress (✓) — KHÔNG nói "do progress". Collocation cố định!'
  },
  {
    en:   '"Pay close attention to grammar rules — they decide your score."',
    vi:   'Hãy chú ý kỹ các quy tắc ngữ pháp — chúng quyết định điểm số của bạn.',
    tag:  'Collocation',
    note: 'pay attention to (✓) — KHÔNG nói "give attention". pay + attention = cặp cố định.'
  },
  {
    en:   '"Take responsibility for your own learning — nobody can do it for you."',
    vi:   'Hãy chịu trách nhiệm cho việc học của chính bạn — không ai có thể làm thay bạn.',
    tag:  'Collocation',
    note: 'take responsibility for sth (✓) — KHÔNG nói "make responsibility".'
  },
  {
    en:   '"Reading widely helps you gain knowledge and broaden your vocabulary."',
    vi:   'Đọc sách rộng rãi giúp bạn thu nhận kiến thức và mở rộng vốn từ vựng.',
    tag:  'Collocation',
    note: 'gain knowledge/experience/skills (✓) | broaden vocabulary (✓) — cặp collocation phổ biến.'
  },
  {
    en:   '"Make an effort to review your notes every night before you sleep."',
    vi:   'Hãy cố gắng ôn lại ghi chú của bạn mỗi tối trước khi ngủ.',
    tag:  'Collocation',
    note: 'make an effort (✓) — KHÔNG nói "do an effort". Cũng có: make a great/strong effort.'
  },
  {
    en:   '"A single hour of focused study can make a real difference."',
    vi:   'Chỉ một tiếng đồng hồ học tập tập trung có thể tạo ra sự khác biệt thực sự.',
    tag:  'Collocation',
    note: 'make a difference (✓) — tạo ra sự khác biệt. Cũng dùng: make a big/real difference.'
  },
  {
    en:   '"Face challenges with courage and you will fulfill your full potential."',
    vi:   'Đối mặt với thử thách bằng dũng cảm và bạn sẽ phát huy hết tiềm năng của mình.',
    tag:  'Collocation',
    note: 'face challenges (✓) | fulfill potential (✓) — hai collocation quan trọng.'
  },
  {
    en:   '"Burning the midnight oil helped him achieve his academic goals."',
    vi:   'Thức khuya học bài đã giúp anh ấy đạt được mục tiêu học tập.',
    tag:  'Collocation + Idiom',
    note: 'burn the midnight oil = thức khuya làm việc/học. achieve goals (✓) — KHÔNG nói "reach" khi nói về mục tiêu học tập.'
  },
  {
    en:   '"If you study hard, you will pass the exam with flying colours."',
    vi:   'Nếu bạn học chăm chỉ, bạn sẽ vượt qua kỳ thi một cách xuất sắc.',
    tag:  'Conditional Type 1',
    note: 'If + S + V(s/es), S + will + V. "with flying colours" = đậu xuất sắc.'
  },
  {
    en:   '"If I were in your shoes, I would never give up on my dreams."',
    vi:   'Nếu tôi ở vị trí của bạn, tôi sẽ không bao giờ từ bỏ ước mơ của mình.',
    tag:  'Conditional Type 2',
    note: 'If + S + were/V-ed, S + would + V. "in your shoes" = ở vị trí của bạn — hay dùng!'
  },
  {
    en:   '"If she had started earlier, she would have avoided so much stress."',
    vi:   'Nếu cô ấy bắt đầu sớm hơn, cô ấy đã không phải chịu nhiều áp lực như vậy.',
    tag:  'Conditional Type 3',
    note: 'If + S + had + V3, S + would have + V3. Diễn tả điều KHÔNG xảy ra trong quá khứ.'
  },
  {
    en:   '"I wish I had paid more attention in class last year."',
    vi:   'Tôi ước gì mình đã chú ý hơn trong lớp năm ngoái.',
    tag:  'Wish Sentence (past)',
    note: 'wish + S + had + V3 = ước điều đã không xảy ra trong quá khứ. Khác với "I wish I could...".'
  },
  {
    en:   '"Great things are achieved by those who refuse to stop trying."',
    vi:   'Những điều vĩ đại được thực hiện bởi những người từ chối ngừng cố gắng.',
    tag:  'Passive Voice',
    note: 'S + am/is/are + V3. Bị động thì hiện tại đơn. "refuse to + V" = từ chối làm gì.'
  },
  {
    en:   '"This exam has been taken by millions of students over the years."',
    vi:   'Kỳ thi này đã được hàng triệu học sinh tham dự trong nhiều năm qua.',
    tag:  'Passive Voice',
    note: 'S + has/have + been + V3. Bị động thì hiện tại hoàn thành.'
  },
  {
    en:   '"Students who work consistently are the ones who achieve the best results."',
    vi:   'Những học sinh học đều đặn là những người đạt được kết quả tốt nhất.',
    tag:  'Relative Clause',
    note: 'who = đại từ quan hệ thay thế cho người (subject). Không dùng "which" cho người.'
  },
  {
    en:   '"The knowledge that you gain today is an investment in your future."',
    vi:   'Kiến thức mà bạn thu nhận hôm nay là một khoản đầu tư cho tương lai của bạn.',
    tag:  'Relative Clause',
    note: 'that/which = đại từ quan hệ thay thế cho vật. Có thể bỏ "that" khi nó là tân ngữ.'
  },
  {
    en:   '"Avoid making the same mistake twice — learning from failure is key."',
    vi:   'Tránh mắc cùng một lỗi hai lần — học hỏi từ thất bại là điều then chốt.',
    tag:  'Gerund',
    note: 'avoid + V-ing (✓). Nhóm động từ + V-ing: avoid, enjoy, mind, consider, suggest...'
  },
  {
    en:   '"Remember to review your answers before handing in your exam paper."',
    vi:   'Hãy nhớ kiểm tra lại đáp án trước khi nộp bài thi.',
    tag:  'Gerund vs To-inf',
    note: 'remember to V = nhớ để làm (tương lai). remember V-ing = nhớ lại đã làm (quá khứ).'
  },
  {
    en:   '"He tried to concentrate on studying despite the loud noise outside."',
    vi:   'Anh ấy cố gắng tập trung vào việc học dù có tiếng ồn lớn bên ngoài.',
    tag:  'To-Infinitive',
    note: 'try to V = cố gắng làm. Khác với try V-ing = thử làm xem sao. concentrate on + V-ing.'
  },
  {
    en:   '"She was so determined that nothing could stop her from reaching her goal."',
    vi:   'Cô ấy quyết tâm đến mức không gì có thể ngăn cô ấy đạt được mục tiêu.',
    tag:  'So...That',
    note: 'so + adj/adv + that + clause. Còn có: such + a/an + adj + noun + that.'
  },
  {
    en:   '"Not only does hard work build skills, but it also builds character."',
    vi:   'Làm việc chăm chỉ không chỉ xây dựng kỹ năng, mà còn rèn luyện nhân cách.',
    tag:  'Not only...but also (Đảo ngữ)',
    note: 'Not only + auxiliary + S + V, but S + also + V. Đảo ngữ với "not only" ở đầu câu!'
  },
  {
    en:   '"The harder you work now, the easier the exam will be on the day."',
    vi:   'Bạn càng nỗ lực nhiều hơn bây giờ, kỳ thi sẽ càng dễ dàng hơn vào ngày đó.',
    tag:  'Double Comparative',
    note: 'The + comparative, the + comparative = càng... càng... Cấu trúc THPTQG rất hay ra!'
  },
  {
    en:   '"Despite feeling nervous, she walked in and gave her best performance."',
    vi:   'Mặc dù cảm thấy lo lắng, cô ấy bước vào và thể hiện tốt nhất có thể.',
    tag:  'Despite / In spite of',
    note: 'despite / in spite of + N / V-ing. KHÔNG dùng despite + clause (phải dùng although).'
  },
];

// ==================== KHỞI TẠO CLIENT & POOL ====================
const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ]
});

let activePeriod = false;
let currentDayKey = null;
const voiceStartTimes = new Map();

// ====================== HELPER ======================
function debugLog(section, msg) {
  const now = new Date().toLocaleString('vi-VN', { timeZone: TIMEZONE });
  console.log(`[${now}] [${section}] ${msg}`);
}

function parseTimeToCron(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return `${m} ${h} * * *`;
}

function createProgressBar(current, max, length = 15) {
  const filled = Math.max(0, Math.min(length, Math.round((current / max) * length)));
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = Math.min(100, Math.round((current / max) * 100));
  return `${bar} ${percent}%`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getRankEmoji(index) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `\`${String(index + 1).padStart(2, '0')}.\``;
}

function getRankColor(index) {
  if (index === 0) return COLORS.GOLD;
  if (index === 1) return COLORS.SILVER;
  if (index === 2) return COLORS.BRONZE;
  return COLORS.PRIMARY;
}

// ====================== QUIZ HELPERS ======================
function getQuizRankInfo(points) {
  const tiers = [...QUIZ_CONFIG.RANK_TIERS].reverse();
  const current = tiers.find(t => points >= t.min) || tiers[tiers.length - 1];
  const nextIdx = tiers.indexOf(current) - 1;
  const next = nextIdx >= 0 ? tiers[nextIdx] : null;
  return { current, next };
}

function formatStreakEmoji(streak) {
  if (streak >= 50) return '🔥🔥🔥🔥🔥';
  if (streak >= 20) return '🔥🔥🔥🔥';
  if (streak >= 10) return '🔥🔥🔥';
  if (streak >= 5)  return '🔥🔥';
  if (streak > 0)   return '🔥';
  return '❌';
}

// ====================== DATABASE ======================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_progress (
      day_key       TEXT    NOT NULL,
      user_id       TEXT    NOT NULL,
      total_seconds INTEGER DEFAULT 0,
      PRIMARY KEY (day_key, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id        TEXT PRIMARY KEY,
      subject   TEXT NOT NULL,
      question  TEXT NOT NULL,
      options   JSONB NOT NULL,
      correct   TEXT NOT NULL,
      image_url TEXT,
      sent_at   TIMESTAMPTZ DEFAULT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id            SERIAL PRIMARY KEY,
      user_id       TEXT NOT NULL,
      question_id   TEXT NOT NULL,
      chosen        TEXT NOT NULL,
      is_correct    BOOLEAN NOT NULL,
      answered_at   TIMESTAMPTZ DEFAULT NOW(),
      points        INTEGER DEFAULT 0,
      answer_time_ms INTEGER,
      UNIQUE(user_id, question_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_scores (
      user_id           TEXT PRIMARY KEY,
      total_points      INTEGER DEFAULT 0,
      correct_count     INTEGER DEFAULT 0,
      wrong_count       INTEGER DEFAULT 0,
      streak_count      INTEGER DEFAULT 0,
      longest_quiz_streak INTEGER DEFAULT 0,
      total_answered    INTEGER DEFAULT 0,
      last_answered_at  TIMESTAMPTZ,
      rank_tier         TEXT DEFAULT 'Unranked'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_achievements (
      id          SERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      badge       TEXT NOT NULL,
      earned_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, badge)
    );
  `);

  debugLog('DB', 'Kết nối Database thành công. Các bảng đã sẵn sàng.');
}

// ====================== VOICE TRACKING ======================
async function addVoiceTime(userId, seconds) {
  if (!currentDayKey || seconds <= 0) return;
  try {
    await pool.query(`
      INSERT INTO voice_progress (day_key, user_id, total_seconds)
      VALUES ($1, $2, $3)
      ON CONFLICT (day_key, user_id)
      DO UPDATE SET total_seconds = voice_progress.total_seconds + EXCLUDED.total_seconds
    `, [currentDayKey, userId, seconds]);
  } catch (err) {
    debugLog('DB_ERR', `Lỗi lưu time user ${userId}: ${err.message}`);
  }
}

// ====================== RANK ROLE MANAGEMENT ======================
async function updateUserRankRole(member, rankInfo) {
  try {
    if (!member || !rankInfo?.current) return;
    const guild = member.guild;
    if (!guild) return;

    const rankName = rankInfo.current.name;
    const rankColor = rankInfo.current.roleColor || rankInfo.current.color;

    // Tìm hoặc tạo role cho rank hiện tại
    let role = guild.roles.cache.find(r => r.name === rankName);
    if (!role) {
      role = await guild.roles.create({
        name: rankName,
        color: rankColor,
        reason: 'Auto-created by Quiz Bot for rank system',
        hoist: true, // Hiển thị riêng nhóm trong sidebar
        mentionable: false,
      });
      debugLog('ROLE', `Đã tạo role mới: ${rankName}`);
    }

    // Xóa các role rank cũ khác
    const allRankNames = new Set(QUIZ_CONFIG.RANK_TIERS.map(t => t.name));
    const rolesToRemove = member.roles.cache.filter(r => allRankNames.has(r.name) && r.id !== role.id);
    if (rolesToRemove.size > 0) {
      await member.roles.remove(rolesToRemove);
    }

    // Gán role mới nếu chưa có
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      debugLog('ROLE', `Đã cấp role ${rankName} cho ${member.user.username}`);
    }
  } catch (err) {
    debugLog('ROLE_ERR', `Lỗi cập nhật role: ${err.message}`);
  }
}

// ====================== QUIZ SCORING ======================
async function calculateQuizPoints(userId, isCorrect, answerTimeMs = null) {
  const scoreRes = await pool.query(
    'SELECT * FROM quiz_scores WHERE user_id = $1',
    [userId]
  );
  let score = scoreRes.rows[0];

  if (!score) {
    await pool.query(`
      INSERT INTO quiz_scores (user_id, total_points, correct_count, wrong_count, streak_count, total_answered)
      VALUES ($1, 0, 0, 0, 0, 0)
    `, [userId]);
    score = { total_points: 0, correct_count: 0, wrong_count: 0, streak_count: 0, longest_quiz_streak: 0, total_answered: 0 };
  }

  let points = 0;
  let newStreak = isCorrect ? (score.streak_count || 0) + 1 : 0;
  let newLongest = Math.max(score.longest_quiz_streak || 0, newStreak);

  if (isCorrect) {
    points = QUIZ_CONFIG.POINTS_CORRECT;

    for (const bonus of [...QUIZ_CONFIG.STREAK_BONUS].reverse()) {
      if (newStreak >= bonus.streak) {
        points += bonus.bonus;
        break;
      }
    }

    if (answerTimeMs && answerTimeMs < QUIZ_CONFIG.SPEED_THRESHOLD_MS) {
      points += QUIZ_CONFIG.POINTS_SPEED_BONUS;
    }
  }

  const newTotalPoints = (score.total_points || 0) + points;
  const newCorrect = (score.correct_count || 0) + (isCorrect ? 1 : 0);
  const newWrong = (score.wrong_count || 0) + (isCorrect ? 0 : 1);
  const newTotalAnswered = (score.total_answered || 0) + 1;

  await pool.query(`
    INSERT INTO quiz_scores (user_id, total_points, correct_count, wrong_count, streak_count, longest_quiz_streak, total_answered, last_answered_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      total_points = EXCLUDED.total_points,
      correct_count = EXCLUDED.correct_count,
      wrong_count = EXCLUDED.wrong_count,
      streak_count = EXCLUDED.streak_count,
      longest_quiz_streak = GREATEST(quiz_scores.longest_quiz_streak, EXCLUDED.longest_quiz_streak),
      total_answered = EXCLUDED.total_answered,
      last_answered_at = NOW()
  `, [userId, newTotalPoints, newCorrect, newWrong, newStreak, newLongest, newTotalAnswered]);

  const rankInfo = getQuizRankInfo(newTotalPoints);
  if (rankInfo.current) {
    await pool.query(
      'UPDATE quiz_scores SET rank_tier = $1 WHERE user_id = $2',
      [rankInfo.current.name, userId]
    );
  }

  return {
    points,
    newStreak,
    newLongest,
    totalPoints: newTotalPoints,
    isCorrect,
    correctCount: newCorrect,
    wrongCount: newWrong,
    totalAnswered: newTotalAnswered
  };
}

async function checkAchievements(userId, stats, answerHour = null) {
  const earned = [];
  const existing = await pool.query(
    'SELECT badge FROM quiz_achievements WHERE user_id = $1',
    [userId]
  );
  const existingSet = new Set(existing.rows.map(r => r.badge));

  const accuracy = stats.totalAnswered > 0 ? (stats.correctCount / stats.totalAnswered) : 0;

  const checks = [
    { id: 'first_blood',    condition: stats.correctCount >= 1 },
    { id: 'streak_3',       condition: stats.newStreak >= 3 },
    { id: 'streak_5',       condition: stats.newStreak >= 5 },
    { id: 'streak_10',      condition: stats.newStreak >= 10 },
    { id: 'streak_20',      condition: stats.newStreak >= 20 },
    { id: 'streak_50',      condition: stats.newStreak >= 50 },
    { id: 'master_100',     condition: stats.totalPoints >= 100 },
    { id: 'master_300',     condition: stats.totalPoints >= 300 },
    { id: 'master_500',     condition: stats.totalPoints >= 500 },
    { id: 'master_1000',    condition: stats.totalPoints >= 1000 },
    { id: 'master_1500',    condition: stats.totalPoints >= 1500 },
    { id: 'speed_demon',    condition: stats.answerTimeMs < QUIZ_CONFIG.SPEED_THRESHOLD_MS && stats.isCorrect },
    { id: 'accuracy_50',    condition: stats.totalAnswered >= 20 && accuracy >= 0.50 },
    { id: 'accuracy_80',    condition: stats.totalAnswered >= 20 && accuracy >= 0.80 },
    { id: 'accuracy_100',   condition: stats.totalAnswered >= 20 && accuracy >= 1.0 },
    { id: 'perfection_10',  condition: stats.correctCount >= 10 && stats.wrongCount === 0 },
    { id: 'perfection_50',  condition: stats.correctCount >= 50 && stats.wrongCount === 0 },
    { id: 'veteran_10',     condition: stats.totalAnswered >= 10 },
    { id: 'veteran_50',     condition: stats.totalAnswered >= 50 },
    { id: 'veteran_100',    condition: stats.totalAnswered >= 100 },
    { id: 'veteran_500',    condition: stats.totalAnswered >= 500 },
    { id: 'early_bird',     condition: stats.isCorrect && answerHour !== null && answerHour >= 5 && answerHour < 8 },
    { id: 'night_owl',      condition: stats.isCorrect && answerHour !== null && answerHour >= 22 },
  ];

  for (const check of checks) {
    if (check.condition && !existingSet.has(check.id)) {
      await pool.query(
        'INSERT INTO quiz_achievements (user_id, badge) VALUES ($1, $2)',
        [userId, check.id]
      );
      const ach = QUIZ_CONFIG.ACHIEVEMENTS.find(a => a.id === check.id);
      if (ach) earned.push(ach);
    }
  }
  return earned;
}

// ====================== LEADERBOARD EMBEDS ======================
async function buildLeaderboardEmbed(dayKey) {
  const data = await pool.query(
    'SELECT user_id, total_seconds FROM voice_progress WHERE day_key = $1 ORDER BY total_seconds DESC',
    [dayKey]
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('📊 THỐNG KÊ THỜI GIAN HỌC')
    .setDescription(`-# Ngày: **${dayKey}**`)
    .setTimestamp();

  if (data.rows.length === 0) {
    embed.setColor(COLORS.WARNING);
    embed.addFields({
      name: 'ℹ️ Chưa có dữ liệu',
      value: 'Chưa có dữ liệu ghi nhận trong ca học này.\nHãy tham gia voice channel để bắt đầu ghi nhận!'
    });
    return embed;
  }

  await Promise.all(data.rows.map(async (row) => {
    try {
      const user = await client.users.fetch(row.user_id);
      row.username = user.username;
      row.avatar = user.displayAvatarURL({ size: 64 });
    } catch {
      row.username = `User#${row.user_id.slice(-4)}`;
      row.avatar = null;
    }
  }));

  const totalParticipants = data.rows.length;
  const totalTime = data.rows.reduce((sum, r) => sum + r.total_seconds, 0);

  embed.addFields(
    { name: '👥 Thành viên', value: `\`${totalParticipants}\` người`, inline: true },
    { name: '⏱️ Tổng thời gian', value: `\`${formatDuration(totalTime)}\``, inline: true },
    { name: '\u200b', value: '\u200b', inline: true }
  );

  embed.addFields({ name: '\u200b', value: '**🏆 BẢNG XẾP HẠNG**' });

  data.rows.slice(0, 3).forEach((row, index) => {
    const hours = Math.floor(row.total_seconds / 3600);
    const mins = Math.floor((row.total_seconds % 3600) / 60);
    const progressBar = createProgressBar(row.total_seconds, 9000, 10);

    embed.addFields({
      name: `${getRankEmoji(index)} ${row.username}`,
      value:
        `\`\`\`yaml\n` +
        `Thời gian: ${hours}h ${String(mins).padStart(2, '0')}m\n` +
        `Tiến độ:  ${progressBar}\n` +
        `\`\`\``,
      inline: false
    });
  });

  if (data.rows.length > 3) {
    const others = data.rows.slice(3);
    let othersText = '';
    others.forEach((row, idx) => {
      const dur = formatDuration(row.total_seconds);
      othersText += `${getRankEmoji(idx + 3)} **${row.username}** — \`${dur}\`\n`;
    });
    embed.addFields({
      name: '📋 Các vị trí còn lại',
      value: othersText || '\u200b',
      inline: false
    });
  }

  embed.setFooter({ text: '🎯 Ca học: 20:00 - 01:30 | Tự động cập nhật mỗi 5 phút' });
  return embed;
}

// ====================== COUNTDOWN FEATURE ======================
function buildCountdownEmbed() {
  const now = new Date();
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('⏳ ĐẾM NGƯỢC KỲ THI')
    .setDescription('-# Cập nhật mỗi ngày lúc 00:00')
    .setTimestamp();

  for (const exam of EXAMS) {
    const unixTime = Math.floor(exam.date.getTime() / 1000);
    const diffTime = exam.date - now;

    if (diffTime > 0) {
      const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const progressBar = createProgressBar(Math.max(0, 365 - days), 365, 12);

      embed.addFields({
        name: `📌 ${exam.name}`,
        value:
          `> ⏰ **Thời gian:** <t:${unixTime}:F>\n` +
          `> ⏳ **Còn lại:** **${days}** ngày ${hours}h (<t:${unixTime}:R>)\n` +
          `> 📈 **Tiến độ năm:** \`${progressBar}\``,
        inline: false
      });
    } else {
      embed.addFields({
        name: `📌 ${exam.name}`,
        value: `> ✅ *Kỳ thi đã diễn ra vào <t:${unixTime}:D>!*`,
        inline: false
      });
    }
  }

  return embed;
}

function buildEnglishTipEmbed() {
  const tip = ENGLISH_TIPS[Math.floor(Math.random() * ENGLISH_TIPS.length)];

  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('📖 English Tip of the Day')
    .setDescription(
      `### 🏷️ ${tip.tag}\n\n` +
      `> *${tip.en}*\n\n` +
      `🇻🇳 **Dịch nghĩa:**\n${tip.vi}\n\n` +
      `💡 **Ghi chú:**\n\`\`\`fix\n${tip.note}\n\`\`\``
    )
    .setFooter({ text: '📚 Ôn tập mỗi ngày một chút — tích tiểu thành đại!' })
    .setTimestamp();
}

// ====================== QUIZTOP PAGINATION ======================
const QUIZTOP_PER_PAGE = 5;

async function buildQuizTopEmbed(rows, page, totalPages) {
  const startIdx = (page - 1) * QUIZTOP_PER_PAGE;
  const pageRows = rows.slice(startIdx, startIdx + QUIZTOP_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('🏆 BẢNG XẾP HẠNG QUIZ')
    .setDescription(`Tổng **${rows.length}** người chơi | Trang **${page}/${totalPages}**`)
    .setTimestamp();

  await Promise.all(pageRows.map(async (row) => {
    try {
      const user = await client.users.fetch(row.user_id);
      row.username = user.username;
    } catch {
      row.username = `User#${row.user_id.slice(-4)}`;
    }
  }));

  pageRows.forEach((row, idx) => {
    const globalIdx = startIdx + idx;
    const rank = getRankEmoji(globalIdx);
    const rankInfo = getQuizRankInfo(row.total_points);
    const accuracy = row.total_answered > 0
      ? Math.round((row.correct_count / row.total_answered) * 100)
      : 0;

    embed.addFields({
      name: `${rank} ${row.username}`,
      value:
        `\`\`\`yaml\n` +
        `Điểm:   ${row.total_points}\n` +
        `Rank:   ${rankInfo.current.name}\n` +
        `Đúng:   ${row.correct_count}/${row.total_answered} (${accuracy}%)\n` +
        `Streak: ${formatStreakEmoji(row.longest_quiz_streak)} ${row.longest_quiz_streak}\n` +
        `\`\`\``,
      inline: false
    });
  });

  embed.setFooter({ text: `Trang ${page}/${totalPages} · Dùng nút bên dưới để chuyển trang` });
  return embed;
}

function buildQuizTopButtons(page, totalPages) {
  const prevBtn = new ButtonBuilder()
    .setCustomId(`quiztop_page_${page - 1}`)
    .setLabel('◀ Trước')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId('quiztop_page_info')
    .setLabel(`${page} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`quiztop_page_${page + 1}`)
    .setLabel('Sau ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages);

  return new ActionRowBuilder().addComponents(prevBtn, pageBtn, nextBtn);
}

// ====================== QUIZ FEATURE ======================
async function importQuestionsFromJSON(questions) {
  let inserted = 0;
  let skipped  = 0;

  for (const q of questions) {
    if (!q.id || !q.subject || !q.question || !q.options || !q.correct) {
      skipped++;
      continue;
    }
    try {
      const result = await pool.query(`
        INSERT INTO quiz_questions (id, subject, question, options, correct, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [q.id, q.subject, q.question, JSON.stringify(q.options), q.correct, q.image_url || null]);

      if (result.rowCount > 0) inserted++;
      else skipped++;
    } catch (err) {
      debugLog('QUIZ_IMPORT_ERR', `Lỗi câu ${q.id}: ${err.message}`);
      skipped++;
    }
  }

  return { inserted, skipped };
}

// ====================== PDF → QUIZ IMAGES (TEXT-AWARE CROPPING) ======================

/**
 * Dùng pdfjs để extract text positions, tìm chính xác tọa độ Y của từng câu hỏi,
 * sau đó crop ảnh từ "Câu N" đến đầu "Câu N+1" (hoặc "PHẦN II" với câu cuối).
 */
/**
 * Hybrid detection: Text → Interpolation → Equal-split fallback
 * Tối ưu cho đề toán 12 câu trắc nghiệm (thường nằm trong 2 trang đầu)
 */
async function detectQuestionBoundaries(pdfBuffer, numQuestions, renderScale) {
  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,           // Hỗ trợ font hệ thống tốt hơn
    cMapUrl: './node_modules/pdfjs-dist/cmaps/',
    cMapPacked: true,
  }).promise;

  const bounds = [];        // { pageIdx, yPx, questionNum: number | 'END' }
  const pageDims = [];      // { width, height } của từng trang đã scale

  // ── PASS 1: Text extraction trên tất cả trang ──
  for (let pNum = 1; pNum <= pdfDoc.numPages; pNum++) {
    const page = await pdfDoc.getPage(pNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const pageW = viewport.width * renderScale;
    const pageH = viewport.height * renderScale;
    pageDims.push({ width: pageW, height: pageH });

    // Gom text items → dòng (bucket Y tolerance 20px cho font lớn/công thức)
    const lineMap = new Map();
    for (const item of textContent.items) {
      if (!item.str?.trim()) continue;
      const y = (viewport.height - item.transform[5]) * renderScale;
      const x = item.transform[4] * renderScale;
      const bucket = Math.round(y / 20) * 20;

      if (!lineMap.has(bucket)) {
        lineMap.set(bucket, { yPx: y, xMin: x, parts: [] });
      }
      const ln = lineMap.get(bucket);
      ln.parts.push({ str: item.str, xPx: x });
      if (x < ln.xMin) ln.xMin = x;
    }

    // Sắp xếp dòng từ trên xuống
    const lines = [...lineMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);

    for (const ln of lines) {
      ln.parts.sort((a, b) => a.xPx - b.xPx);
      const fullStr = ln.parts.map(p => p.str).join('').trim();

      // Pattern số câu: "1.", "1 .", "1)", "1 ", "1. ", "12."
      // Hỗ trợ cả dấu chấm Unicode (．) và dấu ngoặc
      const qMatch = fullStr.match(/^(\d{1,2})\s*[.．)\s]/);
      if (qMatch) {
        const num = parseInt(qMatch[1]);
        // Chỉ nhận câu trong khoảng 1..numQuestions, chưa có trong bounds
        if (num >= 1 && num <= numQuestions && !bounds.some(b => b.questionNum === num)) {
          bounds.push({ pageIdx: pNum - 1, yPx: ln.yPx, questionNum: num, source: 'text' });
          debugLog('PDF_DETECT', `Trang ${pNum}: câu ${num} @ y=${Math.round(ln.yPx)}px`);
        }
      }

      // Pattern kết thúc Phần I: "PHẦN II", "PHẦN 2", "PART II"
      if (/PHA[NẦ][N\s]*II|PHẦN\s*II|PART\s*II|PHAN\s*II/i.test(fullStr)) {
        if (!bounds.some(b => b.questionNum === 'END')) {
          bounds.push({ pageIdx: pNum - 1, yPx: ln.yPx, questionNum: 'END', source: 'text' });
          debugLog('PDF_DETECT', `Trang ${pNum}: PHẦN II @ y=${Math.round(ln.yPx)}px`);
        }
      }
    }
  }

  await pdfDoc.destroy();

  // ── PASS 2: Interpolation cho câu bị miss (nếu tìm được ≥2 câu) ──
  const foundNums = bounds
    .filter(b => typeof b.questionNum === 'number')
    .map(b => b.questionNum)
    .sort((a, b) => a - b);

  if (foundNums.length >= 2 && foundNums.length < numQuestions) {
    for (let i = 1; i <= numQuestions; i++) {
      if (foundNums.includes(i)) continue;

      // Tìm câu trước/sau gần nhất đã biết vị trí
      const prev = bounds
        .filter(b => typeof b.questionNum === 'number' && b.questionNum < i)
        .sort((a, b) => b.questionNum - a.questionNum)[0];
      const next = bounds
        .filter(b => typeof b.questionNum === 'number' && b.questionNum > i)
        .sort((a, b) => a.questionNum - b.questionNum)[0];

      if (prev && next && prev.pageIdx === next.pageIdx) {
        // Nội suy trên cùng 1 trang
        const ratio = (i - prev.questionNum) / (next.questionNum - prev.questionNum);
        const yPx = prev.yPx + (next.yPx - prev.yPx) * ratio;
        bounds.push({ pageIdx: prev.pageIdx, yPx, questionNum: i, source: 'interpolated' });
        debugLog('PDF_DETECT', `Nội suy câu ${i} @ y=${Math.round(yPx)}px`);
      }
    }
  }

  // ── PASS 3: Equal-split fallback (nếu vẫn thiếu hoặc không detect được) ──
  const finalFound = bounds.filter(b => typeof b.questionNum === 'number').length;
  if (finalFound < numQuestions) {
    debugLog('PDF_DETECT', `Fallback equal-split: ${finalFound}/${numQuestions} câu tìm được`);
    bounds.length = 0; // Xóa bounds cũ, chia đều

    // Giả định: chỉ cần 2 trang đầu cho 12 câu (tối ưu cho đề toán)
    const pagesToUse = Math.min(2, pageDims.length);
    const perPage = Math.ceil(numQuestions / pagesToUse);

    for (let p = 0; p < pagesToUse; p++) {
      const startQ = p * perPage + 1;
      const endQ = Math.min((p + 1) * perPage, numQuestions);
      const countOnPage = endQ - startQ + 1;
      // Bỏ phần header/footer (~10% trên, ~5% dưới)
      const usableH = pageDims[p].height * 0.85;
      const offsetY = pageDims[p].height * 0.08;
      const step = usableH / countOnPage;

      for (let q = startQ; q <= endQ; q++) {
        const idx = q - startQ;
        bounds.push({
          pageIdx: p,
          yPx: offsetY + idx * step,
          questionNum: q,
          source: 'fallback'
        });
      }
    }

    // END bound ở cuối trang cuối cùng được dùng
    const lastPage = pagesToUse - 1;
    bounds.push({
      pageIdx: lastPage,
      yPx: pageDims[lastPage].height * 0.92,
      questionNum: 'END',
      source: 'fallback'
    });
  }

  // Sắp xếp cuối cùng
  bounds.sort((a, b) => a.pageIdx - b.pageIdx || a.yPx - b.yPx);
  return { numPages: pdfDoc.numPages, bounds, pageDims };
}

/**
 * Pipeline chính: PDF → detect boundaries → crop → upload Discord → trả về question objects.
 */
async function convertPdfToQuizImages(pdfBuffer, answersArray, subject, numQuestions, dumpChannelId, interaction) {
  const dumpChannel = client.channels.cache.get(dumpChannelId);
  if (!dumpChannel) {
    throw new Error(`Không tìm thấy kênh dump (ID: ${dumpChannelId}).\nHãy set biến môi trường \`PDF_DUMP_CHANNEL_ID\`.`);
  }

  const RENDER_SCALE = 2.5;
  const PAD_TOP      = 75;    // ⬆️ Lùi sâu lên để bao phủ đỉnh số câu + công thức trên
  const PAD_BOT      = 55;    // ⬆️ Cắt sâu vào trước câu tiếp, tránh lấn đáp án/hình
  const MIN_HEIGHT   = 130;   // Chiều cao tối thiểu mỗi câu

  // ── 1. Render chỉ 2 trang đầu (tối ưu cho 12 câu đầu) ──
  await interaction.editReply({ embeds: [progressEmbed('`[1/3]` Đang render PDF → ảnh...')] });

  const pageImages = [];
  let pageCount = 0;
  for await (const pageImg of await pdf(pdfBuffer, { scale: RENDER_SCALE })) {
    pageImages.push(pageImg);
    pageCount++;
    if (pageCount >= 2) break; // ⭐ Chỉ cần 2 trang đầu cho 12 câu trắc nghiệm
  }

  if (pageImages.length === 0) throw new Error('PDF không có trang nào render được.');

  // ── 2. Detect boundaries (hybrid) ──
  await interaction.editReply({ embeds: [progressEmbed(`\`[2/3]\` Đang phân tích vị trí ${numQuestions} câu...`)] });

  const { bounds, pageDims } = await detectQuestionBoundaries(pdfBuffer, numQuestions, RENDER_SCALE);

  const foundNums = bounds
    .filter(b => typeof b.questionNum === 'number')
    .map(b => b.questionNum)
    .sort((a, b) => a - b);

  debugLog('PDF_DETECT', `Tìm được: [${foundNums.join(',')}] | END: ${bounds.some(b => b.questionNum === 'END')}`);

  // ── 3. Crop & upload ──
  await interaction.editReply({ embeds: [progressEmbed(`\`[3/3]\` Đang cắt và upload ${numQuestions} ảnh...`)] });

  const questions   = [];
  const slugSubject = subject.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const batchId     = Date.now();

  for (let qi = 0; qi < numQuestions; qi++) {
    const qNum       = qi + 1;
    const startBound = bounds.find(b => b.questionNum === qNum);

    if (!startBound) {
      debugLog('PDF_CROP', `⚠️ Bỏ qua câu ${qNum} — không tìm thấy boundary`);
      continue;
    }

    const isLast  = qNum === numQuestions;
    const endBound = bounds.find(b =>
      (typeof b.questionNum === 'number' && b.questionNum === qNum + 1) ||
      (isLast && b.questionNum === 'END')
    );

    const pageIdx  = startBound.pageIdx;
    const pageBuf  = pageImages[pageIdx];
    const pageMeta = await sharp(pageBuf).metadata();

// Lùi top lên nhiều hơn, nhưng không vượt quá biên trang
    const topY = Math.max(0, Math.floor(startBound.yPx) - PAD_TOP);

    let botY;
    if (endBound && endBound.pageIdx === pageIdx) {
      botY = Math.floor(endBound.yPx) - PAD_BOT;
    } else if (endBound && endBound.pageIdx > pageIdx) {
      botY = pageMeta.height - 50;
    } else {
      botY = Math.min(pageMeta.height - 50, topY + Math.floor(pageMeta.height * 0.30));
    }

    // ⭐ FIX CHỐNG CẮT NGƯỢC / CÂU QUÁ NGẮN
    if (botY <= topY + MIN_HEIGHT) {
      botY = topY + MIN_HEIGHT;
    }

    const cropH = botY - topY;

    let cropBuf;
    try {
      cropBuf = await sharp(pageBuf)
        .extract({ left: 0, top: topY, width: pageMeta.width, height: cropH })
        .png({ compressionLevel: 9 }) // Nén nhẹ để upload nhanh hơn
        .toBuffer();
    } catch (err) {
      debugLog('PDF_CROP_ERR', `Câu ${qNum}: top=${topY} h=${cropH} pageH=${pageMeta.height} — ${err.message}`);
      continue;
    }

    const msg = await dumpChannel.send({
      content: `-# [PDF-Quiz] ${subject} — Câu ${qNum} | batch:${batchId}`,
      files: [{ attachment: cropBuf, name: `${slugSubject}_cau${qNum}.png` }],
    });

    const imageUrl = msg.attachments.first()?.url;
    if (!imageUrl) throw new Error(`Không lấy được CDN URL cho câu ${qNum}.`);

    const answer = answersArray[qi]?.trim().toUpperCase() ?? '?';

    questions.push({
      id:        `pdf_${slugSubject}_${batchId}_q${qNum}`,
      subject,
      question:  `[IMG] ${subject} — Câu ${qNum}`,
      options:   { A: 'A', B: 'B', C: 'C', D: 'D' },
      correct:   answer,
      image_url: imageUrl,
    });

    if (questions.length % 3 === 0 || questions.length === numQuestions) {
      await interaction.editReply({
        embeds: [progressEmbed(
          `\`[3/3]\` Upload: **${questions.length}/${numQuestions}**\n` +
          createProgressBar(questions.length, numQuestions, 20)
        )],
      });
    }
  }

  return questions;
}

/** Helper: embed loading đơn giản */
function progressEmbed(text) {
  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle('⏳ Đang xử lý PDF...')
    .setDescription(text);
}

async function sendDailyQuiz(channelId = COUNTDOWN_CHANNEL_ID) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) return debugLog('QUIZ', 'Không tìm thấy kênh Quiz.');

  const res = await pool.query(
    'SELECT * FROM quiz_questions WHERE sent_at IS NULL ORDER BY RANDOM() LIMIT 1'
  );

  if (res.rows.length === 0) {
    debugLog('QUIZ', '⚠️ Ngân hàng câu hỏi đã hết!');
    const warnEmbed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('⚠️ Hết câu hỏi')
      .setDescription('Ngân hàng câu hỏi đã hết! Admin vui lòng dùng `/addquestion` để bổ sung.')
      .setFooter({ text: '💡 Sử dụng /quizstats để xem thống kê kho câu hỏi' });
    await channel.send({ embeds: [warnEmbed] });
    return;
  }

  const q = res.rows[0];

  // Đánh dấu đã gửi (chỉ để tránh gửi trùng, không dùng cho expiry)
  await pool.query(
    'UPDATE quiz_questions SET sent_at = NOW() WHERE id = $1',
    [q.id]
  );

  const isImageQuestion = !!q.image_url;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ORANGE)
    .setTitle(`📝 DAILY QUIZ — ${q.subject.toUpperCase()}`)
    .setFooter({ text: '⏱️ Chọn đáp án bên dưới — chỉ bạn thấy kết quả!' })
    .setTimestamp();

  if (isImageQuestion) {
    embed
      .setDescription(
        `### 📸 Xem câu hỏi trong ảnh bên dưới và chọn đáp án đúng!\n\n` +
        `💡 Mỗi câu chỉ trả lời **1 lần**!\n` +
        `✅ Đúng: **+${QUIZ_CONFIG.POINTS_CORRECT} điểm** | Streak bonus: **+3→+50** | ⚡ Speed bonus: **+5**`
      )
      .setImage(q.image_url);
  } else {
    embed.setDescription(
      `### ❓ Câu hỏi\n${q.question}\n\n` +
      `**A.** ${q.options.A}\n` +
      `**B.** ${q.options.B}\n` +
      `**C.** ${q.options.C}\n` +
      `**D.** ${q.options.D}\n\n` +
      `💡 Mỗi câu chỉ trả lời **1 lần**!\n` +
      `✅ Đúng: **+${QUIZ_CONFIG.POINTS_CORRECT} điểm** | Streak bonus: **+3→+50** | ⚡ Speed bonus: **+5**`
    );
    if (q.image_url) embed.setImage(q.image_url);
  }

  const row = new ActionRowBuilder().addComponents(
    ['A', 'B', 'C', 'D'].map(opt =>
      new ButtonBuilder()
        .setCustomId(`quiz_${q.id}_${opt}`)
        .setLabel(opt)
        .setStyle(ButtonStyle.Primary)
    )
  );

  await channel.send({ embeds: [embed], components: [row] });
  debugLog('QUIZ', `Đã gửi câu hỏi [${q.id}] lên kênh.`);
}

// ====================== XỬ LÝ THỜI GIAN & TRACKING ======================
function getTrackingState() {
  const now      = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const currentMins = localNow.getHours() * 60 + localNow.getMinutes();

  const [sH, sM]  = VOICE_START_TIME.split(':').map(Number);
  const [eH, eM]  = VOICE_END_TIME.split(':').map(Number);
  const startMins = sH * 60 + sM;
  const endMins   = eH * 60 + eM;

  let isActive  = false;
  let dayOffset = 0;

  if (startMins < endMins) {
    isActive = currentMins >= startMins && currentMins < endMins;
  } else {
    if (currentMins >= startMins)       { isActive = true; }
    else if (currentMins < endMins)     { isActive = true; dayOffset = -1; }
  }

  const targetDate = new Date(localNow);
  targetDate.setDate(targetDate.getDate() + dayOffset);
  const dayKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

  return { isActive, dayKey };
}

async function startTrackingSession(dayKeyStr) {
  currentDayKey = dayKeyStr;
  activePeriod  = true;
  voiceStartTimes.clear();

  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    guild.members.cache.forEach(member => {
      if (member.voice?.channelId) voiceStartTimes.set(member.id, new Date());
    });
    debugLog('TRACKING', `Khởi động ca học: ${currentDayKey} | ${voiceStartTimes.size} user đang online`);
  }
}

// ====================== CRON JOBS ======================
cron.schedule(parseTimeToCron(VOICE_START_TIME), async () => {
  const { dayKey } = getTrackingState();
  await startTrackingSession(dayKey);
}, { timezone: TIMEZONE });

cron.schedule(parseTimeToCron(VOICE_END_TIME), async () => {
  const promises = [];
  for (const [userId, startTime] of voiceStartTimes.entries()) {
    const seconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    promises.push(addVoiceTime(userId, seconds));
  }
  await Promise.all(promises);

  activePeriod = false;
  voiceStartTimes.clear();
  debugLog('TRACKING', 'Đã kết thúc ca học và chốt sổ dữ liệu.');
}, { timezone: TIMEZONE });

cron.schedule(parseTimeToCron(RESET_TIME), async () => {
  if (!currentDayKey || !RESULT_CHANNEL_ID) return;
  const channel = client.channels.cache.get(RESULT_CHANNEL_ID);
  if (channel) {
    const embed = await buildLeaderboardEmbed(currentDayKey);
    await channel.send({ embeds: [embed] });
    debugLog('RESULT', `Đã gửi bảng thành tích ngày ${currentDayKey}`);
  }
}, { timezone: TIMEZONE });

cron.schedule('*/5 * * * *', async () => {
  if (voiceStartTimes.size === 0 || !activePeriod) return;
  let savedCount = 0;
  for (const [userId, startTime] of [...voiceStartTimes.entries()]) {
    const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    if (elapsedSeconds >= 60) {
      await addVoiceTime(userId, elapsedSeconds);
      voiceStartTimes.set(userId, new Date());
      savedCount++;
    }
  }
  if (savedCount > 0) debugLog('AUTO-SAVE', `Đã đồng bộ thời gian cho ${savedCount} users.`);
}, { timezone: TIMEZONE });

cron.schedule('0 0 * * *', async () => {
  const channel = client.channels.cache.get(COUNTDOWN_CHANNEL_ID);
  if (!channel) {
    debugLog('COUNTDOWN', 'Không tìm thấy kênh đếm ngược.');
    return;
  }

  await channel.send({ embeds: [buildCountdownEmbed()] });
  await channel.send({ embeds: [buildEnglishTipEmbed()] });

  debugLog('COUNTDOWN', 'Đã gửi thông báo đếm ngược + English Tip lúc nửa đêm.');
}, { timezone: TIMEZONE });

// ── Lịch Quiz: 15 lần/ngày (dàn trải đều) ──
const QUIZ_SCHEDULE = [
  '0  6  * * *',   // 06:00 — Sáng sớm
  '10 7  * * *',   // 07:10
  '55 8  * * *',   // 08:55
  '35 9  * * *',   // 08:55
  '40 10 * * *',   // 10:40
  '30 11 * * *',   // 11:30 — Trước giờ nghỉ trưa
  '20 13 * * *',   // 13:20
  '30 14 * * *',   // 14:30 — Đầu giờ chiều
  '25 15 * * *',   // 15:25
  '5  16 * * *',   // 16:05
  '30 17 * * *',   // 17:30 — Sau giờ tan học/làm
  '30 18 * * *',   // 18:30
  '0  19 * * *',   // 19:00
  '50 19 * * *',   // 19:50
  '45 20 * * *',   // 20:45
  '40 21 * * *',   // 21:40
  '00 22 * * *',   // 22:00
  '35 22 * * *',   // 22:35
  '0  23 * * *',   // 23:00 — Khuya
  '45  23 * * *',   // 23:45
];

for (const cronExpr of QUIZ_SCHEDULE) {
  cron.schedule(cronExpr, async () => {
    debugLog('CRON', `Tới giờ gửi Daily Quiz! (${cronExpr.trim()})`);
    await sendDailyQuiz();
  }, { timezone: TIMEZONE });
}

// ====================== SỰ KIỆN VOICE ======================
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!activePeriod || !newState.member || newState.guild.id !== GUILD_ID) return;

  const userId     = newState.member.id;
  const wasInVoice = !!oldState.channelId;
  const isInVoice  = !!newState.channelId;

  if (!wasInVoice && isInVoice) {
    voiceStartTimes.set(userId, new Date());
  } else if (wasInVoice && !isInVoice) {
    if (voiceStartTimes.has(userId)) {
      const start   = voiceStartTimes.get(userId);
      const seconds = Math.floor((Date.now() - start.getTime()) / 1000);
      await addVoiceTime(userId, seconds);
      voiceStartTimes.delete(userId);
    }
  }
});

// ====================== SỰ KIỆN INTERACTION ======================
client.on('interactionCreate', async interaction => {

  // ── Xử lý nút phân trang /quiztop ──
  if (interaction.isButton() && interaction.customId.startsWith('quiztop_page_')) {
    const targetPage = parseInt(interaction.customId.split('_')[2]);
    if (isNaN(targetPage) || targetPage < 1) return;

    try {
      await interaction.deferUpdate();

      const res = await pool.query(`
        SELECT * FROM quiz_scores
        WHERE total_answered > 0
        ORDER BY total_points DESC
      `);

      if (res.rows.length === 0) return;

      const totalPages = Math.ceil(res.rows.length / QUIZTOP_PER_PAGE);
      const page = Math.min(Math.max(targetPage, 1), totalPages);

      const embed = await buildQuizTopEmbed(res.rows, page, totalPages);
      const components = totalPages > 1 ? [buildQuizTopButtons(page, totalPages)] : [];

      await interaction.editReply({ embeds: [embed], components });
    } catch (err) {
      debugLog('CMD_ERR', `Lỗi nút quiztop: ${err.message}`);
    }
    return;
  }

  // ── Xử lý nút bấm quiz ──
  if (interaction.isButton() && interaction.customId.startsWith('quiz_')) {
    const parts  = interaction.customId.split('_');
    const chosen = parts.pop();
    const qId    = parts.slice(1).join('_');

    const attemptRes = await pool.query(
      'SELECT * FROM quiz_attempts WHERE user_id = $1 AND question_id = $2',
      [interaction.user.id, qId]
    );

    if (attemptRes.rows.length > 0) {
      const prev = attemptRes.rows[0];
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('⚠️ Đã trả lời')
        .setDescription(
          `Bạn đã trả lời câu này rồi!\n\n` +
          `Lựa chọn trước: **${prev.chosen}**\n` +
          `Kết quả: ${prev.is_correct ? '✅ Đúng' : '❌ Sai'}`
        )
        .setFooter({ text: 'Mỗi câu chỉ được trả lời 1 lần!' });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    const res = await pool.query('SELECT * FROM quiz_questions WHERE id = $1', [qId]);
    const q   = res.rows[0];

    if (!q) {
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi')
        .setDescription('Câu hỏi này không tồn tại hoặc bị lỗi dữ liệu!');
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    // Không kiểm tra expiry - câu hỏi tồn tại vĩnh viễn
    const isCorrect = chosen === q.correct;

    let answerTimeMs = null;
    const messageTime = interaction.message?.createdTimestamp;
    if (messageTime) {
      answerTimeMs = Date.now() - messageTime;
    }

    const nowHour = new Date().getHours();

    await pool.query(`
      INSERT INTO quiz_attempts (user_id, question_id, chosen, is_correct, points, answer_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [interaction.user.id, qId, chosen, isCorrect, isCorrect ? QUIZ_CONFIG.POINTS_CORRECT : 0, answerTimeMs]);

    const stats = await calculateQuizPoints(interaction.user.id, isCorrect, answerTimeMs);

    const newAchievements = await checkAchievements(interaction.user.id, {
      ...stats,
      answerTimeMs,
      correctCount: stats.correctCount,
      wrongCount: stats.wrongCount,
      totalAnswered: stats.totalAnswered
    }, nowHour);

    const rankInfo = getQuizRankInfo(stats.totalPoints);

    // Cập nhật role Discord theo rank
    try {
      const guild = client.guilds.cache.get(GUILD_ID);
      if (guild) {
        const member = await guild.members.fetch(interaction.user.id);
        await updateUserRankRole(member, rankInfo);
      }
    } catch (err) {
      debugLog('ROLE_ERR', `Không thể cập nhật role: ${err.message}`);
    }

    let description =
      `Bạn chọn: **${chosen}**${q.options[chosen] !== chosen ? ` — ${q.options[chosen]}` : ''}\n\n` +
      `Đáp án đúng: **${q.correct}**${q.options[q.correct] !== q.correct ? ` — ${q.options[q.correct]}` : ''}\n\n`;

    if (isCorrect) {
      description += `🎉 **+${stats.points} điểm**\n`;
      if (stats.newStreak > 1) {
        description += `${formatStreakEmoji(stats.newStreak)} Streak: **${stats.newStreak}** câu đúng liên tiếp\n`;
      }
      if (answerTimeMs && answerTimeMs < QUIZ_CONFIG.SPEED_THRESHOLD_MS) {
        description += `⚡ Bonus tốc độ: +${QUIZ_CONFIG.POINTS_SPEED_BONUS} điểm\n`;
      }
    } else {
      description += `💔 Streak reset về 0\n`;
    }

    description += `\n🏆 Tổng điểm: **${stats.totalPoints}** | Rank: **${rankInfo.current.name}**`;

    if (rankInfo.next) {
      description += `\n📈 Cần **${rankInfo.next.min - stats.totalPoints}** điểm nữa để lên **${rankInfo.next.name}**`;
    }

    if (newAchievements.length > 0) {
      description += `\n\n🎖️ **Thành tựu mới:**\n`;
      newAchievements.forEach(ach => {
        description += `• ${ach.name} — ${ach.desc}\n`;
      });
    }

    const replyEmbed = new EmbedBuilder()
      .setTitle(isCorrect ? '✅ CHÍNH XÁC!' : '❌ RẤT TIẾC!')
      .setColor(isCorrect ? COLORS.SUCCESS : COLORS.DANGER)
      .setDescription(description)
      .setFooter({
        text: isCorrect
          ? `${formatStreakEmoji(stats.newStreak)} Streak: ${stats.newStreak} | Rank: ${rankInfo.current.name}`
          : '💪 Cố gắng lên! Streak sẽ quay lại thôi!'
      });

    return interaction.reply({ embeds: [replyEmbed], flags: MessageFlags.Ephemeral });
  }

  if (!interaction.isChatInputCommand()) return;

  // ── /check ──
  if (interaction.commandName === 'check') {
    try {
      const res = await pool.query('SELECT day_key FROM voice_progress ORDER BY day_key DESC LIMIT 1');
      const targetDayKey = currentDayKey || res.rows[0]?.day_key;
      if (!targetDayKey) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(COLORS.WARNING)
          .setTitle('📭 Chưa có dữ liệu')
          .setDescription('Chưa có dữ liệu ghi nhận nào. Hãy tham gia voice channel trong ca học để bắt đầu!');
        return interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
      }
      const embed = await buildLeaderboardEmbed(targetDayKey);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      debugLog('CMD_ERR', `Lỗi /check: ${err.message}`);
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi hệ thống')
        .setDescription('Đã xảy ra lỗi, vui lòng thử lại sau.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
  }

  // ── /quiztop ──
  if (interaction.commandName === 'quiztop') {
    try {
      const res = await pool.query(`
        SELECT * FROM quiz_scores
        WHERE total_answered > 0
        ORDER BY total_points DESC
      `);

      if (res.rows.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle('📊 Bảng Xếp Hạng Quiz')
          .setDescription('Chưa có ai tham gia Quiz! Hãy là người đầu tiên!');
        return interaction.reply({ embeds: [emptyEmbed] });
      }

      const totalPages = Math.ceil(res.rows.length / QUIZTOP_PER_PAGE);
      const embed = await buildQuizTopEmbed(res.rows, 1, totalPages);
      const components = totalPages > 1 ? [buildQuizTopButtons(1, totalPages)] : [];

      await interaction.reply({ embeds: [embed], components });
    } catch (err) {
      debugLog('CMD_ERR', `Lỗi /quiztop: ${err.message}`);
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi hệ thống')
        .setDescription('Không thể lấy bảng xếp hạng.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
  }

  // ── /quizprofile ──
  if (interaction.commandName === 'quizprofile') {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;

      const scoreRes = await pool.query(
        'SELECT * FROM quiz_scores WHERE user_id = $1',
        [targetUser.id]
      );
      const score = scoreRes.rows[0];

      if (!score || score.total_answered === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle(`📊 Profile Quiz — ${targetUser.username}`)
          .setDescription(
            targetUser.id === interaction.user.id
              ? 'Bạn chưa tham gia Quiz nào!\nHãy trả lời câu hỏi để bắt đầu tích lũy điểm.'
              : `${targetUser.username} chưa tham gia Quiz nào.`
          );
        return interaction.reply({ embeds: [emptyEmbed] });
      }

      const rankInfo = getQuizRankInfo(score.total_points);
      const accuracy = score.total_answered > 0
        ? Math.round((score.correct_count / score.total_answered) * 100)
        : 0;

      const achRes = await pool.query(
        'SELECT badge FROM quiz_achievements WHERE user_id = $1 ORDER BY earned_at DESC',
        [targetUser.id]
      );
      const achievements = achRes.rows.map(r =>
        QUIZ_CONFIG.ACHIEVEMENTS.find(a => a.id === r.badge)
      ).filter(Boolean);

      const embed = new EmbedBuilder()
        .setColor(rankInfo.current.color)
        .setTitle(`📊 Profile Quiz — ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: '🏆 Tổng điểm', value: `**${score.total_points}**`, inline: true },
          { name: '🎖️ Rank', value: `**${rankInfo.current.name}**`, inline: true },
          { name: '✅ Tỷ lệ đúng', value: `**${accuracy}%**`, inline: true },
          { name: '🔥 Streak hiện tại', value: `**${score.streak_count}**`, inline: true },
          { name: '🌟 Streak cao nhất', value: `**${score.longest_quiz_streak}**`, inline: true },
          { name: '📝 Tổng câu đã làm', value: `**${score.total_answered}**`, inline: true }
        );

      if (rankInfo.next) {
        const progress = createProgressBar(score.total_points, rankInfo.next.min, 12);
        embed.addFields({
          name: `📈 Tiến độ đến ${rankInfo.next.name}`,
          value: `\`${progress}\` (${score.total_points}/${rankInfo.next.min})`,
          inline: false
        });
      }

      if (achievements.length > 0) {
        embed.addFields({
          name: `🎖️ Thành tựu (${achievements.length})`,
          value: achievements.slice(0, 8).map(a => `${a.name}`).join(' | '),
          inline: false
        });
      }

      embed.setFooter({
        text: `Tham gia lần cuối: ${score.last_answered_at ? new Date(score.last_answered_at).toLocaleDateString('vi-VN') : 'Chưa có'}`
      }).setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      debugLog('CMD_ERR', `Lỗi /quizprofile: ${err.message}`);
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi hệ thống')
        .setDescription('Không thể lấy thông tin profile.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
  }

  // ── /quizhistory ──
  if (interaction.commandName === 'quizhistory') {
    try {
      const page = interaction.options.getInteger('page') || 1;
      const perPage = 5;
      const offset = (page - 1) * perPage;

      const res = await pool.query(`
        SELECT qa.*, qq.question, qq.options, qq.correct
        FROM quiz_attempts qa
        JOIN quiz_questions qq ON qa.question_id = qq.id
        WHERE qa.user_id = $1
        ORDER BY qa.answered_at DESC
        LIMIT $2 OFFSET $3
      `, [interaction.user.id, perPage, offset]);

      const countRes = await pool.query(
        'SELECT COUNT(*) FROM quiz_attempts WHERE user_id = $1',
        [interaction.user.id]
      );
      const total = parseInt(countRes.rows[0].count);
      const totalPages = Math.ceil(total / perPage);

      if (res.rows.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(COLORS.INFO)
          .setTitle('📜 Lịch Sử Quiz')
          .setDescription('Bạn chưa trả lời câu nào!');
        return interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`📜 Lịch Sử Quiz — Trang ${page}/${totalPages}`)
        .setDescription(`Tổng: **${total}** câu đã trả lời`)
        .setTimestamp();

      res.rows.forEach((row, idx) => {
        const status = row.is_correct ? '✅' : '❌';
        const date = new Date(row.answered_at).toLocaleDateString('vi-VN', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        embed.addFields({
          name: `${status} Câu ${offset + idx + 1}`,
          value:
            `> ${row.question.startsWith('[IMG]') ? '📸 *(câu hỏi dạng ảnh)*' : row.question.substring(0, 80) + (row.question.length > 80 ? '...' : '')}\n` +
            `> Bạn chọn: **${row.chosen}** | Đáp án: **${row.correct}**\n` +
            `> 🕐 ${date} | ${row.is_correct ? `+${row.points} điểm` : '0 điểm'}`,
          inline: false
        });
      });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      debugLog('CMD_ERR', `Lỗi /quizhistory: ${err.message}`);
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi hệ thống')
        .setDescription('Không thể lấy lịch sử.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
  }

  // ── /debug ──
  if (interaction.commandName === 'debug') {
    const mode = interaction.options.getString('mode') || 'countdown';
    if (mode === 'quiz') {
      const loadingEmbed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setDescription('⏳ Đang tải câu hỏi thử...');
      await interaction.reply({ embeds: [loadingEmbed], flags: MessageFlags.Ephemeral });
      await sendDailyQuiz(interaction.channelId);
    } else if (mode === 'countdown') {
      await interaction.reply({ embeds: [buildCountdownEmbed()] });
    } else if (mode === 'tip') {
      await interaction.reply({ embeds: [buildEnglishTipEmbed()] });
    } else {
      await interaction.reply({ embeds: [buildCountdownEmbed()] });
      await interaction.followUp({ embeds: [buildEnglishTipEmbed()], flags: MessageFlags.Ephemeral });
    }
  }

  // ── /importpdf ──
  if (interaction.commandName === 'importpdf') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const attachment   = interaction.options.getAttachment('file');
    const answersRaw   = interaction.options.getString('answers');
    const subject      = interaction.options.getString('subject').trim();
    const numQuestions = interaction.options.getInteger('count') ?? 12;

    // Validate: phải là PDF
    if (!attachment.name.toLowerCase().endsWith('.pdf')) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.DANGER)
          .setTitle('❌ Sai định dạng')
          .setDescription('Vui lòng đính kèm file **`.pdf`**!')
        ]
      });
    }

    // Parse & validate đáp án
    const answersArray = answersRaw
      .split(',')
      .map(a => a.trim().toUpperCase())
      .filter(a => /^[ABCD]$/.test(a));

    if (answersArray.length !== numQuestions) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.DANGER)
          .setTitle('❌ Số đáp án không khớp')
          .setDescription(
            `Cần **${numQuestions}** đáp án (tham số \`count\`), nhưng nhập được **${answersArray.length}** đáp án hợp lệ.\n\n` +
            `Định dạng: \`B,D,A,C,B,D,A,B,D,A,A,B\` *(chỉ A B C D, cách nhau bằng dấu phẩy)*`
          )
        ]
      });
    }

    try {
      // Download PDF về buffer
      const pdfResponse = await fetch(attachment.url);
      if (!pdfResponse.ok) throw new Error(`Không tải được file PDF: ${pdfResponse.statusText}`);
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      // Chạy pipeline: render → detect → crop → upload → insert DB
      const questions = await convertPdfToQuizImages(
        pdfBuffer,
        answersArray,
        subject,
        numQuestions,
        PDF_DUMP_CHANNEL_ID,
        interaction
      );

      const { inserted, skipped } = await importQuestionsFromJSON(questions);
      const countRes   = await pool.query('SELECT COUNT(*) FROM quiz_questions WHERE sent_at IS NULL');
      const remaining  = countRes.rows[0].count;

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Import PDF Thành Công!')
          .setColor(COLORS.SUCCESS)
          .setDescription(
            `📄 **File:** \`${attachment.name}\`\n` +
            `📚 **Môn:** ${subject}\n` +
            `🔍 **Tự động detect:** ${numQuestions} câu\n\n` +
            `✅ **Thêm mới:** \`${inserted}\` câu ảnh\n` +
            `⏭️ **Bỏ qua (trùng):** \`${skipped}\` câu\n\n` +
            `📦 **Tổng câu chưa dùng:** \`${remaining}\` câu`
          )
          .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
          .setTimestamp()
        ]
      });

      debugLog('PDF_IMPORT', `${interaction.user.username} import "${attachment.name}": +${inserted} câu (${subject})`);

    } catch (err) {
      debugLog('PDF_IMPORT_ERR', err.message);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.DANGER)
          .setTitle('❌ Lỗi xử lý PDF')
          .setDescription(`\`\`\`\n${err.message.substring(0, 1800)}\n\`\`\``)
        ]
      });
    }
  }

  // ── /addquestion ──
  if (interaction.commandName === 'addquestion') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const attachment = interaction.options.getAttachment('file');

    if (!attachment.name.endsWith('.json')) {
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Sai định dạng')
        .setDescription('Vui lòng đính kèm file `.json`!');
      return interaction.editReply({ embeds: [errEmbed] });
    }

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Không tải được file: ${response.statusText}`);

      const text      = await response.text();
      const questions = JSON.parse(text);

      if (!Array.isArray(questions)) {
        const errEmbed = new EmbedBuilder()
          .setColor(COLORS.DANGER)
          .setTitle('❌ Sai cấu trúc')
          .setDescription('File JSON phải là một **mảng** (array) các câu hỏi!');
        return interaction.editReply({ embeds: [errEmbed] });
      }

      const { inserted, skipped } = await importQuestionsFromJSON(questions);

      const countRes = await pool.query('SELECT COUNT(*) FROM quiz_questions WHERE sent_at IS NULL');
      const remaining = countRes.rows[0].count;

      const resultEmbed = new EmbedBuilder()
        .setTitle('📚 Kết quả Import')
        .setColor(COLORS.SUCCESS)
        .setDescription(
          `✅ **Thêm mới:** \`${inserted}\` câu\n` +
          `⏭️ **Bỏ qua:** \`${skipped}\` câu\n\n` +
          `📦 **Tổng câu chưa dùng:** \`${remaining}\` câu`
        )
        .setFooter({ text: `Thực hiện bởi ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });
      debugLog('QUIZ_IMPORT', `Admin ${interaction.user.username} đã import: +${inserted} câu, bỏ qua ${skipped} câu.`);

    } catch (err) {
      debugLog('QUIZ_IMPORT_ERR', err.message);
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi đọc file')
        .setDescription(`\`${err.message}\``);
      await interaction.editReply({ embeds: [errEmbed] });
    }
  }

  // ── /quizstats ──
  if (interaction.commandName === 'quizstats') {
    try {
      const res = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE sent_at IS NULL)  AS remaining,
          COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS used,
          COUNT(*) AS total
        FROM quiz_questions
      `);
      const { remaining, used, total } = res.rows[0];

      const embed = new EmbedBuilder()
        .setTitle('📊 Thống Kê Ngân Hàng Câu Hỏi')
        .setColor(COLORS.PRIMARY)
        .addFields(
          { name: '📦 Tổng câu hỏi', value: `\`${total}\``, inline: true },
          { name: '✅ Chưa dùng', value: `\`${remaining}\``, inline: true },
          { name: '✔️ Đã gửi', value: `\`${used}\``, inline: true }
        )
        .setDescription(
          remaining < 10
            ? '⚠️ **Cảnh báo:** Số câu hỏi còn lại đang thấp, hãy import thêm!'
            : '📚 Kho câu hỏi đang ổn định.'
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('❌ Lỗi hệ thống')
        .setDescription('Không thể lấy thống kê, vui lòng thử lại sau.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
  }
});

// ====================== KHỞI ĐỘNG ======================
client.once('clientReady', async () => {
  console.log('='.repeat(50));
  debugLog('READY', `Bot ${client.user.tag} đã online!`);

  await initDB();

  const commands = [
    new SlashCommandBuilder()
      .setName('check')
      .setDescription('Xem thống kê thời gian học của ca hiện tại'),

    new SlashCommandBuilder()
      .setName('quiztop')
      .setDescription('Xem bảng xếp hạng điểm Quiz'),

    new SlashCommandBuilder()
      .setName('quizprofile')
      .setDescription('Xem thống kê Quiz của bạn hoặc người khác')
      .addUserOption(opt =>
        opt.setName('user')
          .setDescription('Người dùng (để trống = bản thân)')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('quizhistory')
      .setDescription('Xem lịch sử các câu hỏi đã trả lời')
      .addIntegerOption(opt =>
        opt.setName('page')
          .setDescription('Trang (mỗi trang 5 câu)')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('debug')
      .setDescription('[Admin] Test giao diện bot')
      .addStringOption(opt =>
        opt.setName('mode')
          .setDescription('Chọn tính năng muốn test')
          .setRequired(false)
          .addChoices(
            { name: 'Countdown kỳ thi', value: 'countdown' },
            { name: 'Daily Quiz',       value: 'quiz'      },
            { name: 'English Tip',      value: 'tip'       },
            { name: 'Tất cả',           value: 'all'       }
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('addquestion')
      .setDescription('[Admin] Import ngân hàng câu hỏi từ file JSON')
      .addAttachmentOption(opt =>
        opt.setName('file')
          .setDescription('File .json chứa danh sách câu hỏi')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('importpdf')
      .setDescription('[Admin] Import đề thi PDF thành quiz ảnh tự động (tự detect câu hỏi)')
      .addAttachmentOption(opt =>
        opt.setName('file')
          .setDescription('File PDF chứa đề thi (phần trắc nghiệm)')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('answers')
          .setDescription('Đáp án theo thứ tự, cách bằng dấu phẩy. VD: B,D,A,C,B,D,A,B,B,A,C,B')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('subject')
          .setDescription('Tên môn học. VD: Toán, Anh, Lý, Hóa...')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt.setName('count')
          .setDescription('Số câu trắc nghiệm cần import (mặc định: 12)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(40)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('quizstats')
      .setDescription('[Admin] Xem thống kê số câu hỏi còn lại trong kho')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    debugLog('READY', 'Đã đăng ký: /check, /quiztop, /quizprofile, /quizhistory, /debug, /addquestion, /quizstats');
  } catch (error) {
    debugLog('ERR', 'Lỗi đăng ký lệnh: ' + error.message);
  }

  const { isActive, dayKey } = getTrackingState();
  if (isActive) {
    debugLog('RECOVER', `Khôi phục tracking cho ngày ${dayKey}`);
    await startTrackingSession(dayKey);
  }

  console.log('='.repeat(50));
});

process.on('unhandledRejection', (reason) => {
  debugLog('CRITICAL_ERR', `Unhandled Rejection: ${reason}`);
});

client.login(TOKEN);
