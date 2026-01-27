import React, { useState } from 'react'

interface Props {
    onSearch: (query: string) => void
    thumbnailSize: 'S' | 'M' | 'L' | 'XL'
    setThumbnailSize: (size: 'S' | 'M' | 'L' | 'XL') => void
}

export const SearchBar: React.FC<Props> = ({ onSearch, thumbnailSize, setThumbnailSize }) => {
    const [query, setQuery] = useState('')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setQuery(val)
        onSearch(val)
    }

    return (
        <div className="search-bar">
            <input
                type="text"
                placeholder="Buscar por título, autor o ISBN..."
                value={query}
                onChange={handleChange}
                className="search-input"
            />

            <div className="size-selector-pills">
                {(['S', 'M', 'L', 'XL'] as const).map(size => (
                    <button
                        key={size}
                        onClick={() => setThumbnailSize(size)}
                        className={`size-btn ${thumbnailSize === size ? 'active' : ''}`}
                    >
                        {size}
                    </button>
                ))}
            </div>
        </div>
    )
}
