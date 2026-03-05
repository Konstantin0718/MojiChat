import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, FileText, Film, Upload, X, File } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const FILE_TYPES = {
  image: { accept: 'image/*', icon: Image, label: 'Photo' },
  video: { accept: 'video/*', icon: Film, label: 'Video' },
  document: { accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt', icon: FileText, label: 'Document' },
  any: { accept: '*/*', icon: File, label: 'File' },
};

export const FileUploader = ({ onUpload, onCancel, api }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (!file) return;
    
    setSelectedFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });
      
      onUpload?.(response.data);
      clearSelection();
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('image/')) return Image;
    if (type?.startsWith('video/')) return Film;
    if (type?.includes('pdf') || type?.includes('document')) return FileText;
    return File;
  };

  return (
    <div className="space-y-4" data-testid="file-uploader">
      {/* File type buttons */}
      {!selectedFile && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(FILE_TYPES).map(([key, config]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="gap-2 rounded-full"
              onClick={() => {
                fileInputRef.current.accept = config.accept;
                fileInputRef.current.click();
              }}
              data-testid={`upload-${key}-btn`}
            >
              <config.icon className="w-4 h-4" />
              {config.label}
            </Button>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files?.[0])}
      />

      {/* Drop zone */}
      {!selectedFile && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "border-2 border-dashed rounded-2xl p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag & drop a file here, or click a button above
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Max file size: 50MB
          </p>
        </div>
      )}

      {/* Preview */}
      <AnimatePresence>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="relative bg-muted rounded-2xl p-4"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 rounded-full"
              onClick={clearSelection}
              data-testid="clear-file-btn"
            >
              <X className="w-4 h-4" />
            </Button>

            <div className="flex items-start gap-4">
              {/* Preview thumbnail */}
              {preview && selectedFile.type.startsWith('image/') ? (
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="w-20 h-20 object-cover rounded-xl"
                />
              ) : preview && selectedFile.type.startsWith('video/') ? (
                <video 
                  src={preview} 
                  className="w-20 h-20 object-cover rounded-xl"
                />
              ) : (
                <div className="w-20 h-20 bg-background rounded-xl flex items-center justify-center">
                  {(() => {
                    const FileIcon = getFileIcon(selectedFile.type);
                    return <FileIcon className="w-8 h-8 text-muted-foreground" />;
                  })()}
                </div>
              )}

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
                
                {/* Upload progress */}
                {uploading && (
                  <div className="mt-2">
                    <div className="h-1 bg-background rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {uploadProgress}%
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Upload button */}
            {!uploading && (
              <Button
                className="w-full mt-4 rounded-full"
                onClick={uploadFile}
                data-testid="confirm-upload-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                Send File
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
