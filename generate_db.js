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

// НОВОЕ: ручной порядок документов через префикс в начале имени файла.
// Например: "01_Фото свадьбы.jpg", "02-Встреча с родственниками.jpg".
// Специально разрешаем только 1-3 цифры, чтобы не путать с годами в
// названиях файлов (1960, 1974, 2022 и т.п. — это 4 цифры, они не тронутся).
function extractManualOrder(baseName) {
    const m = baseName.match(/^(\d{1,3})[_\-.\s]+(.+)$/);
    if (m) {
        return { order: parseInt(m[1], 10), rest: m[2].trim() };
    }
    return { order: null, rest: baseName };
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
            // НОВОЕ: ищем группы файлов вида "префикс + номер" (например
            // "страница_01.jpg", "страница_02.jpg" ... или "scan1.jpg", "scan2.jpg"...)
            // Если таких файлов подряд достаточно много (BOOK_MIN_PAGES и больше),
            // считаем это отсканированной книгой/альбомом и объединяем в одну
            // запись с постраничным просмотром, а не показываем десятки
            // отдельных мелких карточек.
            const BOOK_MIN_PAGES = 5;
            const numberedGroups = {}; // префикс -> [{num, file}]
            const singles = []; // обычные файлы (не подошли под номерную серию)
            const manualOrders = {}; // file -> ручной порядковый номер (если задан)

            files.forEach(file => {
                let rawBase = path.basename(file, path.extname(file));
                let ext = path.extname(file).toLowerCase();

                // НОВОЕ: сначала снимаем ручной порядковый префикс (если он есть),
                // и запоминаем номер отдельно — дальше везде работаем с "чистым" именем.
                const { order, rest } = extractManualOrder(rawBase);
                if (order !== null) manualOrders[file] = order;
                let base = rest;

                // подходит только для изображений — книги/сканы это фото страниц
                if (TYPE_BY_EXT[ext] !== 'image') { singles.push(file); return; }

                let m = base.match(/^(.*?)[\s_\-]*0*(\d+)$/);
                if (!m) { singles.push(file); return; }

                let prefix = m[1].trim().toLowerCase() || '_noprefix_';
                let num = parseInt(m[2], 10);
                if (!numberedGroups[prefix]) numberedGroups[prefix] = [];
                numberedGroups[prefix].push({ num, file });
            });

            const bookEntries = [];
            Object.keys(numberedGroups).forEach(prefix => {
                const group = numberedGroups[prefix];
                if (group.length >= BOOK_MIN_PAGES) {
                    group.sort((a, b) => a.num - b.num);
                    let rawTitle = prefix === '_noprefix_' ? 'Скан' : prefix.replace(/_/g, ' ').trim();
                    let ruTitle, enTitle;
                    if (isCyrillicText(rawTitle) && rawTitle) {
                        ruTitle = capitalize(rawTitle);
                        enTitle = translationsDict[rawTitle.toLowerCase()] || 'Scanned Document';
                    } else {
                        ruTitle = 'Отсканированный документ';
                        enTitle = rawTitle ? niceEnglishTitle(rawTitle) : 'Scanned Document';
                    }
                    bookEntries.push({
                        type: 'book',
                        title: { ru: `${ruTitle} (${group.length} стр.)`, en: `${enTitle} (${group.length} pages)` },
                        pages: group.map(g => g.file)
                    });
                } else {
                    // группа слишком маленькая — считаем обычными отдельными файлами
                    group.forEach(g => singles.push(g.file));
                }
            });

            const singleEntries = singles.map(file => {
                let rawBase = path.basename(file, path.extname(file));
                // НОВОЕ: убираем ручной порядковый префикс из отображаемого названия
                const { rest } = extractManualOrder(rawBase);
                let cleanTitle = rest.replace(/_/g, ' ').trim();
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
                    },
                    _order: manualOrders[file] !== undefined ? manualOrders[file] : null // служебное поле, ниже удалим
                };
            });

            let combinedEntries = [...bookEntries, ...singleEntries];

            // НОВОЕ: если хотя бы у одного документа задан ручной порядковый номер —
            // сортируем весь список по нему (без номера — считаем "в конце", после всех
            // пронумерованных, и сохраняем прежний порядок между собой — сортировка стабильна).
            const hasManualOrder = combinedEntries.some(e => e._order !== null && e._order !== undefined);
            if (hasManualOrder) {
                combinedEntries = combinedEntries
                    .map((entry, idx) => ({ entry, idx, ord: (entry._order !== null && entry._order !== undefined) ? entry._order : Infinity }))
                    .sort((a, b) => a.ord - b.ord || a.idx - b.idx)
                    .map(x => x.entry);
            }
            // Убираем служебное поле _order — оно не должно попасть в итоговый JSON
            combinedEntries.forEach(entry => delete entry._order);

            documentsIndex[personId] = combinedEntries;
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
