const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.js');
const docsDir = path.join(__dirname, 'documents');
const dictionaryPath = path.join(__dirname, 'translations_dict.txt');
// НОВОЕ: отдельный файл, куда теперь складываются документы,
// вместо того чтобы раздувать database.js
const docsIndexPath = path.join(__dirname, 'documents-index.js');

console.log('🚀 Старт гибридной сборки архива (Умный автоперевод + Ваша точная корректировка)...');

if (!fs.existsSync(dictionaryPath)) {
    fs.writeFileSync(dictionaryPath, '# Пишите сюда ТОЛЬКО те переводы, которые хотите настроить вручную:\n# Русское имя файла = Английский перевод\n', 'utf8');
}

// Загружаем ваши ручные переводы
const translationsDict = {};
const dictLines = fs.readFileSync(dictionaryPath, 'utf8').split('\n');
dictLines.forEach(line => {
    if (line.trim().startsWith('#') || !line.includes('=')) return;
    const [ruPart, enPart] = line.split('=');
    if (ruPart && enPart) {
        translationsDict[ruPart.trim().toLowerCase()] = enPart.trim();
    }
});

// НОВОЕ: какие расширения к какому типу документа относятся
const TYPE_BY_EXT = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image',
    '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.m4v': 'video',
    '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio',
    '.pdf': 'document', '.doc': 'document', '.docx': 'document', '.txt': 'document'
};
const SUPPORTED_EXT = Object.keys(TYPE_BY_EXT);

// Функция авто-переводчика для базовых слов (когда имя файла НА РУССКОМ)
function autoTranslateTitle(russianTitle) {
    const titleLower = russianTitle.toLowerCase();

    if (titleLower.includes('рождении')) return 'Birth Certificate';
    if (titleLower.includes('браке')) return 'Marriage Certificate';
    if (titleLower.includes('смерти')) return 'Death Certificate';
    if (titleLower.includes('справка')) return 'Official Certificate';
    if (titleLower.includes('военный') || titleLower.includes('билет')) return 'Military ID';
    if (titleLower.includes('диплом') || titleLower.includes('аттестат')) return 'Education Diploma';
    if (titleLower.includes('паспорт')) return 'Passport';
    if (titleLower.includes('фото')) return 'Archival Photo';
    if (titleLower.includes('буклет')) return 'Information Booklet';
    if (titleLower.includes('видео') || titleLower.includes('запись видео')) return 'Video Recording';
    if (titleLower.includes('аудио') || titleLower.includes('интервью') || titleLower.includes('голос')) return 'Audio Recording';
    if (titleLower.includes('воспоминани')) return 'Memoir / Notes';

    // Если это просто имя или неопознанный файл, пишем аккуратное базовое название
    return 'Archival Document';
}

// НОВОЕ: словарь ключевых английских слов -> русский перевод.
// Нужен для случая, когда файлы названы латиницей/по-английски (как у Вульфа),
// чтобы на русской кнопке не показывался сырой английский текст.
const EN_TO_RU_WORDS = {
    archiv: 'Архив', archive: 'Архив',
    birth: 'Рождение',
    death: 'Смерть', dearth: 'Смерть',
    marriage: 'Свадьба', wedding: 'Свадьба',
    ktuba: 'Ктуба', ketuba: 'Ктуба', ketubah: 'Ктуба',
    funeral: 'Похороны',
    house: 'Дом',
    children: 'Дети',
    grandchildren: 'Внуки',
    granddaughter: 'Внучка',
    grandson: 'Внук',
    brothers: 'Братья', sister: 'Сестра', sisters: 'Сёстры', brother: 'Брат',
    courtyard: 'Двор',
    artel: 'Артель',
    unknown: 'Неизвестно',
    with: 'с',
    certificate: 'Свидетельство',
    photo: 'Фото', photograph: 'Фото',
    video: 'Видео',
    audio: 'Аудио',
    interview: 'Интервью',
    passport: 'Паспорт',
    military: 'Военный',
    diploma: 'Диплом',
    booklet: 'Буклет',
    memoir: 'Воспоминания', memories: 'Воспоминания',
    portrait: 'Портрет',
    family: 'Семья',
    letter: 'Письмо',
    school: 'Школа',
    work: 'Работа', job: 'Работа',
    army: 'Армия',
    war: 'Война'
};

function capitalize(word) {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// НОВОЕ: если имя файла на английском/латинице — собираем аккуратный русский вариант
// слово за словом (найденные в словаре слова переводим, остальное — считаем именами/местами
// и оставляем как есть, с большой буквы).
function translateEnglishTitleToRussian(cleanTitle) {
    const tokens = cleanTitle.split(' ').filter(Boolean);
    const ruTokens = tokens.map(tok => {
        const key = tok.toLowerCase();
        return EN_TO_RU_WORDS[key] || capitalize(tok);
    });
    return capitalize(ruTokens.join(' '));
}

// НОВОЕ: частые опечатки/варианты написания в именах файлов -> правильное английское слово
const EN_SPELLING_FIXES = {
    dearth: 'Death',
    archiv: 'Archive',
    ktuba: 'Ketubah',
    ketuba: 'Ketubah'
};

// НОВОЕ: если имя файла и так на английском — аккуратно оформляем регистр слов
// и заодно поправляем частые опечатки (dearth -> Death и т.п.)
function niceEnglishTitle(cleanTitle) {
    return cleanTitle.split(' ').filter(Boolean).map(tok => {
        const fix = EN_SPELLING_FIXES[tok.toLowerCase()];
        return fix || capitalize(tok);
    }).join(' ');
}

// НОВОЕ: определяем, на каком языке название файла — по наличию кириллицы
function isCyrillicText(text) {
    return /[а-яёА-ЯЁ]/.test(text);
}

if (!fs.existsSync(dbPath)) {
    console.error('❌ Ошибка: Файл database.js не найден!');
    process.exit(1);
}

let fileContent = fs.readFileSync(dbPath, 'utf8');
let jsonText = fileContent.replace(/^\s*window\.db\s*=\s*/, '').replace(/;\s*$/, '').replace(/\/\/.*$/gm, '');

let db;
try {
    db = JSON.parse(jsonText);
} catch (e) {
    console.error('❌ Ошибка чтения JSON.', e.message);
    process.exit(1);
}

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

const documentsIndex = {}; // НОВОЕ: сюда собираем документы всех персон отдельно от database.js
let updatedCount = 0;

for (const personId in db) {
    const person = db[personId];
    const folderName = person.archive || personId;
    const personFolder = path.join(docsDir, folderName);

    // Убираем документы из самого database.js, если они там остались от старой версии —
    // теперь они живут отдельно, в documents-index.js
    if (person.documents) delete person.documents;

    if (fs.existsSync(personFolder) && fs.lstatSync(personFolder).isDirectory()) {
        const files = fs.readdirSync(personFolder).filter(file => {
            return SUPPORTED_EXT.includes(path.extname(file).toLowerCase());
        });

        if (files.length > 0) {
            documentsIndex[personId] = files.map(file => {
                let cleanTitle = path.basename(file, path.extname(file)).replace(/_/g, ' ').trim();
                let ext = path.extname(file).toLowerCase();
                let fileType = TYPE_BY_EXT[ext] || 'document';

                // НОВОЕ: сначала смотрим, на каком языке само имя файла,
                // чтобы правильно заполнить и русскую, и английскую кнопку —
                // а не оставлять "сырой" текст на одной из них.
                let ruTitle, enTitle;
                const manualOverride = translationsDict[cleanTitle.toLowerCase()];

                if (isCyrillicText(cleanTitle)) {
                    // Имя файла по-русски (например, "справка_о_рождении.pdf")
                    ruTitle = cleanTitle;
                    enTitle = manualOverride || autoTranslateTitle(cleanTitle);
                } else {
                    // Имя файла латиницей/по-английски (например, "vulf_death.png")
                    enTitle = manualOverride || niceEnglishTitle(cleanTitle);
                    ruTitle = translateEnglishTitleToRussian(cleanTitle);
                }

                return {
                    url: file,
                    type: fileType, // тип файла — image / video / audio / document
                    title: {
                        ru: ruTitle,
                        en: enTitle
                    }
                };
            });
            updatedCount++;
        }
    }
}

// Сохраняем database.js БЕЗ документов — он остаётся лёгким и быстрым
fs.writeFileSync(dbPath, `window.db = ${JSON.stringify(db, null, 2)};`, 'utf8');

// Сохраняем отдельный файл со всеми документами
fs.writeFileSync(
    docsIndexPath,
    `window.documentsIndex = ${JSON.stringify(documentsIndex, null, 2)};`,
    'utf8'
);

console.log(`\n✨ Успех! Собрано архивов: ${updatedCount}.`);
console.log(`   → database.js обновлён (документы вынесены отдельно).`);
console.log(`   → documents-index.js создан/обновлён — именно из него теперь подгружаются документы.`);
