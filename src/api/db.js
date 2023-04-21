const DB_NAME = 'chat-db';
const STORE_NAME = 'chat-messages';
//持久化到indexedDB聊天记录
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, 3);

        request.onerror = (event) => reject(`Could not open ${DB_NAME} database`,console.log(event));

        request.onsuccess = (event) => {
            // 检查是否有 messages 对象存储空间
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                reject(`Object store ${STORE_NAME} does not exist`);
            }
            resolve(event.target.result);
        }

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { autoIncrement: true });
                store.createIndex('time', 'time');
            }
        };
    });
}
//新增到数据库
async function addNewMessage(message) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        if (message.key){
            // 查询是否已经存在指定的 key
           if (store.get(message.key)){
               console.log('数据已存在，key:',message.key)
               reject(false)
           }
        }
        console.log("add a message")
        const msg ={...message}
        const request = store.add(msg);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = () => reject(false);
        tx.oncomplete = () => db.close();
    });
}
//获取历史聊天记录
async function getAllMessages() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const timeIndex = store.index('time');
        const request = timeIndex.openCursor();
        const messages = [];

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const primaryKey = cursor.primaryKey; // 获取当前数据的主键
                cursor.value.key =  primaryKey
                messages.push(cursor.value);
                cursor.continue();
            } else {
                resolve(messages);
            }
        };

        request.onerror = () => reject([]);

        tx.oncomplete = () => db.close();
    });
}

//删除
async function delMessage(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        console.log("delete a message,key:",key)
        const request = store.delete(key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(false);
        tx.oncomplete = () => db.close();
    });
}

export {
    openDatabase,
    addNewMessage,
    getAllMessages,
    delMessage
};
