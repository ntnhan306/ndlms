// Đặt trong Repo: ntnhan306/ndlms/api/trigger-action.js

const axios = require('axios');
const Busboy = require('busboy');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Chỉ hỗ trợ phương thức POST');
    }

    const DISPATCH_TOKEN = process.env.DISPATCH_TOKEN; 

    if (!DISPATCH_TOKEN) {
        return res.status(500).json({ message: 'Lỗi cấu hình: Biến DISPATCH_TOKEN không tồn tại.' });
    }

    const formData = { source_owner: null, source_repo: null, target_owner: null, target_repo: null, branch: null, files: [] };
    
    // Xử lý files và data
    await new Promise((resolve, reject) => {
        // ... (Logic Busboy để xử lý files)
        const busboy = Busboy({ headers: req.headers });
        
        busboy.on('field', (fieldname, val) => { formData[fieldname] = val; });
        busboy.on('file', (fieldname, file, filenameInfo) => {
            const chunks = [];
            file.on('data', data => chunks.push(data));
            file.on('end', () => {
                formData.files.push({
                    filename: filenameInfo.filename,
                    content_base64: Buffer.concat(chunks).toString('base64')
                });
            });
        });
        busboy.on('finish', resolve);
        busboy.on('error', reject);
        req.pipe(busboy);
    });

    const { source_owner, source_repo, target_owner, target_repo, branch, files } = formData;
    if (!source_owner || !source_repo || !target_owner || !target_repo || !branch || files.length === 0) {
        return res.status(400).json({ message: 'Thiếu thông tin Repo Nguồn, Repo Đích, Branch hoặc File.' });
    }

    try {
        // Kích hoạt GitHub Action (trong Repo NGUỒN: ntnhan306/ndlms)
        const dispatchUrl = `https://api.github.com/repos/${source_owner}/${source_repo}/dispatches`;
        
        await axios.post(dispatchUrl, {
            event_type: 'upload_files_commit',
            client_payload: {
                target_owner: target_owner,
                target_repo: target_repo,
                branch: branch,
                commit_message: '.',
                files_payload: JSON.stringify(files)
            }
        }, {
            headers: {
                'Authorization': `token ${DISPATCH_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json({
            message: `Yêu cầu upload đã được gửi thành công. GitHub Action đang xử lý commit vào repo ${target_repo}.`,
            action_url: `https://github.com/${source_owner}/${source_repo}/actions`
        });

    } catch (error) {
        const status = error.response ? error.response.status : 500;
        res.status(status).json({ 
            message: 'Lỗi khi gọi GitHub API để kích hoạt Action.',
            detail: error.response ? error.response.data.message : error.message
        });
    }
};
