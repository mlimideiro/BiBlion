import React, { useState } from 'react'
import { LayoutList, Grid2X2, Square } from 'lucide-react'

interface Props {
    onSearch: (query: string) => void
    thumbnailSize: 'S' | 'M' | 'L' | 'XL'
    setThumbnailSize: (size: 'S' | 'M' | 'L' | 'XL') => void
    isMobile?: boolean
    mobileLayout?: 'list' | 'grid' | 'full'
    onSetMobileLayout?: (mode: 'list' | 'grid' | 'full') => void
}

export const SearchBar: React.FC<Props> = ({
    onSearch,
    thumbnailSize,
    setThumbnailSize,
    isMobile = false,
    mobileLayout = 'grid',
    onSetMobileLayout
}) => {
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

            {isMobile ? (
                <div className="size-selector-pills mobile">
                    <button
                        onClick={() => onSetMobileLayout?.('list')}
                        className={`size-btn ${mobileLayout === 'list' ? 'active' : ''}`}
                        title="Lista"
                    >
                        <LayoutList size={20} />
                    </button>
                    <button
                        onClick={() => onSetMobileLayout?.('grid')}
                        className={`size-btn ${mobileLayout === 'grid' ? 'active' : ''}`}
                        title="Cuadrícula"
                    >
                        <Grid2X2 size={20} />
                    </button>
                    <button
                        onClick={() => onSetMobileLayout?.('full')}
                        className={`size-btn ${mobileLayout === 'full' ? 'active' : ''}`}
                        title="Ficha"
                    >
                        <Square size={20} />
                    </button>
                </div>
            ) : (
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
            )}
        </div>
    )
}
