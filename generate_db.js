const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.js');
const docsDir = path.join(__dirname, 'documents');
const dictionaryPath = path.join(__dirname, 'translations_dict.txt');

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

const folders = fs.readdirSync(docsDir);
let updatedCount = 0;

for (const personId in db) {
    const person = db[personId];
    const folderName = person.archive || personId;
    const personFolder = path.join(docsDir, folderName);

    if (fs.existsSync(personFolder) && fs.lstatSync(personFolder).isDirectory()) {
        const files = fs.readdirSync(personFolder).filter(file => {
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(path.extname(file).toLowerCase());
        });

        if (files.length > 0) {
            person.documents = files.map(file => {
                let cleanTitle = path.basename(file, path.extname(file)).replace(/_/g, ' ').trim();
                
                // Сначала ищем в вашем ручном файле. Если не нашли — переводим автоматически!
                let englishTitle = translationsDict[cleanTitle.toLowerCase()] || autoTranslateTitle(cleanTitle);
                
                return {
                    url: file,
                    title: {
                        ru: cleanTitle,
                        en: englishTitle
                    }
                };
            });
            updatedCount++;
        } else {
            delete person.documents;
        }
    }
}

fs.writeFileSync(dbPath, `window.db = ${JSON.stringify(db, null, 2)};`, 'utf8');
console.log(`\n✨ Успех! Собрано папок: ${updatedCount}. Базовые файлы переведены автоматически, уникальные — по словарю.`);