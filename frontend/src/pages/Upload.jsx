import React, { useRef, useState } from 'react'
import { uploadVideo } from '../services/api'

export default function Upload(){
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadedPath, setUploadedPath] = useState('')
  const [status, setStatus] = useState('')

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if(!f) return
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  const onUpload = async () => {
    if(!file) return
    setStatus('Uploading…')
    try {
      const res = await uploadVideo(file)
      setUploadedPath(res.video_path)
      try { window.localStorage.setItem('lastUploadedPath', res.video_path) } catch {}
      setStatus('Uploaded! Ready to Analyze.')
    } catch (err){
      const msg = err?.message ? String(err.message) : 'Upload failed'
      setStatus(msg)
    }
  }

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-6">
        <div className="card p-4 h-100">
          <h5>Upload dashcam/CCTV video</h5>
          <input ref={inputRef} type="file" accept="video/*" className="form-control" onChange={onFileChange} />
          <button className="btn btn-brand mt-3" onClick={onUpload} disabled={!file || status==='Uploading…'}>Upload</button>
          {status && <p className="mt-2 text-secondary">{status}</p>}
          {uploadedPath && <div className="mt-2"><span className="text-secondary">Server path:</span> <code>{uploadedPath}</code></div>}
        </div>
      </div>
      <div className="col-12 col-lg-6">
        <div className="card p-4 h-100">
          <h5>Video Preview</h5>
          {previewUrl ? (
            <video src={previewUrl} controls className="w-100" />
          ) : (
            <p className="text-secondary">Select a video to preview.</p>
          )}
          <div className="mt-3">
                <a href="/analysis" className={`btn ${uploadedPath ? 'btn-brand' : 'btn-neutral disabled'}`}
               onClick={() => { if(uploadedPath){ try { window.localStorage.setItem('lastUploadedPath', uploadedPath) } catch{} } }}>
                Run Analysis
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
