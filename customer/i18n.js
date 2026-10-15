export const languages = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文",
  ta: "தமிழ்",
};
let locale = Object.hasOwn(
  languages,
  localStorage.getItem("crownetic.language"),
)
  ? localStorage.getItem("crownetic.language")
  : "en";
const copy = {
  BAG: ["BEG", "购物袋", "பை"],
  "points per item": [
    "mata setiap item",
    "每件积分",
    "ஒரு பொருளுக்கான புள்ளிகள்",
  ],
  "demo points added to your account.": [
    "mata demo ditambah ke akaun anda.",
    "演示积分已添加至你的账户。",
    "மாதிரி புள்ளிகள் உங்கள் கணக்கில் சேர்க்கப்பட்டன.",
  ],
  "Sign in to earn points on your next purchase.": [
    "Log masuk untuk kumpul mata pada pembelian seterusnya.",
    "登录以在下次购物时赚取积分。",
    "அடுத்த கொள்முதலில் புள்ளிகள் பெற உள்நுழையவும்.",
  ],

  "SHOP ALL": ["SEMUA PRODUK", "所有商品", "அனைத்து பொருட்கள்"],
  "NEW DROP": ["KOLEKSI BAHARU", "新品系列", "புதிய வரவுகள்"],
  "OUR STORY": ["KISAH KAMI", "品牌故事", "எங்கள் கதை"],
  ACCOUNT: ["AKAUN", "账户", "கணக்கு"],
  Language: ["Bahasa", "语言", "மொழி"],
  "Shop the collection": ["Lihat koleksi", "浏览系列", "தொகுப்பைப் பாருங்கள்"],
  "Our story": ["Kisah kami", "品牌故事", "எங்கள் கதை"],
  "Studio / Admin": ["Studio / Admin", "工作室 / 管理", "ஸ்டூடியோ / நிர்வாகம்"],
  "SHOP THE COLLECTION": ["BELI KOLEKSI", "选购系列", "தொகுப்பை வாங்குங்கள்"],
  "EXPLORE THE DROP": [
    "LIHAT KOLEKSI BAHARU",
    "探索新品",
    "புதிய வரவுகளைப் பாருங்கள்",
  ],
  "EXPLORE ALL": ["LIHAT SEMUA", "浏览全部", "அனைத்தையும் காண்க"],
  "YOUR NEXT ROTATION.": [
    "PILIHAN GAYA ANDA.",
    "你的下一套穿搭。",
    "உங்கள் அடுத்த உடை.",
  ],
  "THE EVERYDAY UNIFORM.": ["GAYA SETIAP HARI.", "日常穿搭。", "அன்றாட உடை."],
  "Heavyweight essentials.": [
    "Gaya asas berkualiti.",
    "厚实的日常必备。",
    "தரமான அத்தியாவசிய உடைகள்.",
  ],
  "Made for your everyday rotation.": [
    "Untuk gaya harian anda.",
    "为日常轮换而生。",
    "உங்கள் அன்றாடத்திற்காக.",
  ],
  All: ["Semua", "全部", "அனைத்தும்"],
  Tees: ["Baju T", "T恤", "டி-ஷர்ட்கள்"],
  Bottoms: ["Seluar", "下装", "கால்சட்டைகள்"],
  Accessories: ["Aksesori", "配饰", "அணிகலன்கள்"],
  "SELECT YOUR SIZE": [
    "PILIH SAIZ ANDA",
    "选择尺码",
    "அளவைத் தேர்வு செய்யவும்",
  ],
  QUANTITY: ["KUANTITI", "数量", "எண்ணிக்கை"],
  "ADD TO BAG": ["TAMBAH KE BEG", "加入购物袋", "பையில் சேர்க்கவும்"],
  Left: ["Kiri", "左侧", "இடது"],
  Front: ["Hadapan", "正面", "முன்"],
  Right: ["Kanan", "右侧", "வலது"],
  "THE BAG.": ["BEG ANDA.", "购物袋。", "உங்கள் பை."],
  "YOUR SELECTION": ["PILIHAN ANDA", "你的选择", "உங்கள் தேர்வு"],
  "YOUR BAG IS EMPTY.": [
    "BEG ANDA KOSONG.",
    "购物袋是空的。",
    "உங்கள் பை காலியாக உள்ளது.",
  ],
  Remove: ["Buang", "移除", "நீக்கவும்"],
  "THE DETAILS.": ["BUTIRAN.", "订单详情。", "விவரங்கள்."],
  Subtotal: ["Subjumlah", "小计", "துணை மொத்தம்"],
  "Sample shipping": ["Penghantaran contoh", "模拟运费", "மாதிரி அனுப்புதல்"],
  Total: ["Jumlah", "总计", "மொத்தம்"],
  "SAMPLE CHECKOUT": ["PEMBAYARAN CONTOH", "模拟结账", "மாதிரி கட்டணம்"],
  "MAKE IT YOURS.": [
    "MILIKI GAYA ANDA.",
    "让它属于你。",
    "உங்களுடையதாக்குங்கள்.",
  ],
  "First name": ["Nama pertama", "名字", "முதல் பெயர்"],
  "Last name": ["Nama keluarga", "姓氏", "குடும்பப் பெயர்"],
  "Example email": ["E-mel contoh", "示例邮箱", "மாதிரி மின்னஞ்சல்"],
  "Example delivery address": [
    "Alamat penghantaran contoh",
    "示例收货地址",
    "மாதிரி முகவரி",
  ],
  "Example postcode": ["Poskod contoh", "示例邮编", "மாதிரி அஞ்சல் குறியீடு"],
  Country: ["Negara", "国家", "நாடு"],
  "COMPLETE SAMPLE ORDER": [
    "SELESAIKAN PESANAN CONTOH",
    "完成模拟订单",
    "மாதிரி ஆர்டரை முடிக்கவும்",
  ],
  "CROWNETIC MEMBERS": [
    "AHLI CROWNETIC",
    "CROWNETIC 会员",
    "CROWNETIC உறுப்பினர்கள்",
  ],
  "JOIN THE INNER CIRCLE.": [
    "SERTAI KOMUNITI KAMI.",
    "加入品牌圈。",
    "எங்கள் வட்டத்தில் இணையுங்கள்.",
  ],
  "WELCOME BACK.": ["SELAMAT KEMBALI.", "欢迎回来。", "மீண்டும் வரவேற்கிறோம்."],
  "Your own space. Your next level.": [
    "Ruang anda. Tahap seterusnya.",
    "你的空间，新的等级。",
    "உங்கள் இடம். அடுத்த நிலை.",
  ],
  "Sign in to your collection and rewards.": [
    "Log masuk untuk koleksi dan ganjaran anda.",
    "登录以查看系列与积分。",
    "உங்கள் பொருட்கள் மற்றும் வெகுமதிகளைக் காண உள்நுழையவும்.",
  ],
  "Full name": ["Nama penuh", "姓名", "முழுப் பெயர்"],
  "Email address": ["Alamat e-mel", "电子邮箱", "மின்னஞ்சல் முகவரி"],
  Password: ["Kata laluan", "密码", "கடவுச்சொல்"],
  "Phone number": ["Nombor telefon", "电话号码", "தொலைபேசி எண்"],
  "Delivery address": ["Alamat penghantaran", "收货地址", "விநியோக முகவரி"],
  "CREATE ACCOUNT": ["CIPTA AKAUN", "创建账户", "கணக்கு உருவாக்கவும்"],
  "LOG IN": ["LOG MASUK", "登录", "உள்நுழையவும்"],
  "Log in": ["Log masuk", "登录", "உள்நுழையவும்"],
  "Create an account": ["Cipta akaun", "注册账户", "கணக்கை உருவாக்கவும்"],
  "Already a member?": [
    "Sudah menjadi ahli?",
    "已有账户？",
    "ஏற்கனவே உறுப்பினரா?",
  ],
  "New to CROWNETIC?": [
    "Baharu di CROWNETIC?",
    "初次来到 CROWNETIC？",
    "CROWNETIC-க்கு புதியவரா?",
  ],
  "Use at least 8 characters for your password.": [
    "Gunakan sekurang-kurangnya 8 aksara untuk kata laluan.",
    "密码至少需要8个字符。",
    "கடவுச்சொல்லில் குறைந்தது 8 எழுத்துகள் இருக்க வேண்டும்.",
  ],
  "SAMPLE ACCOUNT — Stored in this browser only. Use example details. Demo points have no cash value.":
    [
      "AKAUN CONTOH — Disimpan dalam pelayar ini sahaja. Gunakan butiran contoh. Mata demo tiada nilai tunai.",
      "示例账户仅保存在此浏览器。请使用示例资料，演示积分无现金价值。",
      "மாதிரி கணக்கு இந்த உலாவியில் மட்டுமே சேமிக்கப்படும். மாதிரி தகவல்களைப் பயன்படுத்தவும். புள்ளிகளுக்கு பண மதிப்பு இல்லை.",
    ],
  "YOUR INNER CIRCLE.": [
    "KOMUNITI ANDA.",
    "你的会员空间。",
    "உங்கள் உறுப்பினர் வட்டம்.",
  ],
  "Welcome back,": ["Selamat kembali,", "欢迎回来，", "மீண்டும் வரவேற்கிறோம்,"],
  "Profile settings": ["Tetapan profil", "个人资料设置", "சுயவிவர அமைப்புகள்"],
  "PROFILE SETTINGS.": [
    "TETAPAN PROFIL.",
    "个人资料设置。",
    "சுயவிவர அமைப்புகள்.",
  ],
  "Back to dashboard": [
    "Kembali ke papan pemuka",
    "返回会员中心",
    "கட்டுப்பாட்டுப் பலகைக்குத் திரும்பவும்",
  ],
  "SAVE PROFILE": ["SIMPAN PROFIL", "保存资料", "சுயவிவரத்தைச் சேமிக்கவும்"],
  "Profile saved.": [
    "Profil disimpan.",
    "资料已保存。",
    "சுயவிவரம் சேமிக்கப்பட்டது.",
  ],
  "TOTAL POINTS": ["JUMLAH MATA", "总积分", "மொத்த புள்ளிகள்"],
  "DEMO POINTS": ["MATA DEMO", "演示积分", "மாதிரி புள்ளிகள்"],
  points: ["mata", "积分", "புள்ளிகள்"],
  "points to": ["mata untuk", "积分即可达到", "புள்ளிகள் இருந்தால்"],
  "YOUR NEXT LEVEL.": [
    "TAHAP SETERUSNYA.",
    "你的下一等级。",
    "உங்கள் அடுத்த நிலை.",
  ],
  "Earn points with every item you buy.": [
    "Kumpul mata untuk setiap item yang dibeli.",
    "每购买一件商品即可赚取积分。",
    "வாங்கும் ஒவ்வொரு பொருளுக்கும் புள்ளிகள் பெறுங்கள்.",
  ],
  "100 points per item by default. Individual items may earn different points.":
    [
      "100 mata setiap item secara lalai. Mata mungkin berbeza mengikut item.",
      "每件商品默认100积分，具体商品积分可能不同。",
      "பொதுவாக ஒவ்வொரு பொருளுக்கும் 100 புள்ளிகள். பொருளுக்கு ஏற்ப மாறலாம்.",
    ],
  "You have reached Platinum.": [
    "Anda telah mencapai Platinum.",
    "你已达到白金等级。",
    "நீங்கள் பிளாட்டினம் நிலையை அடைந்துள்ளீர்கள்.",
  ],
  "YOUR POINTS HISTORY.": [
    "SEJARAH MATA ANDA.",
    "积分记录。",
    "உங்கள் புள்ளி வரலாறு.",
  ],
  "SIGN OUT": ["LOG KELUAR", "退出登录", "வெளியேறவும்"],
  "No purchases yet.": [
    "Belum ada pembelian.",
    "暂无购买记录。",
    "இன்னும் வாங்கவில்லை.",
  ],
  "Your points will appear here after your first purchase.": [
    "Mata akan dipaparkan selepas pembelian pertama anda.",
    "首次购买后，积分将在此显示。",
    "முதல் கொள்முதலுக்குப் பிறகு புள்ளிகள் இங்கு தோன்றும்.",
  ],
  "Sample purchase": ["Pembelian contoh", "模拟购买", "மாதிரி கொள்முதல்"],
  "Purchase points": ["Mata pembelian", "购物积分", "கொள்முதல் புள்ளிகள்"],
  items: ["item", "件商品", "பொருட்கள்"],
  "View your dashboard": [
    "Lihat papan pemuka",
    "查看会员中心",
    "உங்கள் பலகையைப் பார்க்கவும்",
  ],
  "Email or password is incorrect.": [
    "E-mel atau kata laluan tidak betul.",
    "邮箱或密码不正确。",
    "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறானது.",
  ],
  "An account with this email already exists.": [
    "Akaun e-mel ini sudah wujud.",
    "该邮箱已注册。",
    "இந்த மின்னஞ்சலுக்கு ஏற்கனவே கணக்கு உள்ளது.",
  ],
  "Check your email to confirm your account, then log in.": [
    "Semak e-mel untuk sahkan akaun, kemudian log masuk.",
    "请先通过邮件确认账户，再登录。",
    "மின்னஞ்சலில் கணக்கை உறுதிசெய்து உள்நுழையவும்.",
  ],
};
const sources = new WeakMap();
export function getLanguage() {
  return locale;
}
export function languageSelect() {
  return `<label class="sr-only" for="customer-language">Language</label><select id="customer-language" class="language-picker" aria-label="Language">${Object.entries(
    languages,
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${locale === key ? "selected" : ""}>${label}</option>`,
    )
    .join("")}</select>`;
}
export function translateRoot(root) {
  document.documentElement.lang = {
    en: "en",
    ms: "ms",
    zh: "zh-Hans",
    ta: "ta",
  }[locale];
  const index = ["ms", "zh", "ta"].indexOf(locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("script,style,textarea,option")) continue;
    const original = sources.get(node) ?? node.data;
    sources.set(node, original);
    const text = original.trim();
    node.data =
      index < 0 || !copy[text]
        ? original
        : original.replace(text, copy[text][index]);
  }
}
export function setLanguage(value) {
  if (!Object.hasOwn(languages, value)) return;
  locale = value;
  localStorage.setItem("crownetic.language", value);
  translateRoot(document.querySelector("#app"));
}
