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

// Функция авто-переводчика для базовых слов
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
    // НОВОЕ: подсказки для видео/аудио
    if (titleLower.includes('видео') || titleLower.includes('запись видео')) return 'Video Recording';
    if (titleLower.includes('аудио') || titleLower.includes('интервью') || titleLower.includes('голос')) return 'Audio Recording';
    if (titleLower.includes('воспоминани')) return 'Memoir / Notes';

    // Если это просто имя или неопознанный файл, пишем аккуратное базовое название
    return 'Archival Document';
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

                // Сначала ищем в вашем ручном файле. Если не нашли — переводим автоматически!
                let englishTitle = translationsDict[cleanTitle.toLowerCase()] || autoTranslateTitle(cleanTitle);

                return {
                    url: file,
                    type: fileType, // НОВОЕ: тип файла — image / video / audio / document
                    title: {
                        ru: cleanTitle,
                        en: englishTitle
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
