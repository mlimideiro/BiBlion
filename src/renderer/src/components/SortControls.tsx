import React from 'react'

export type SortField = 'none' | 'title' | 'author'
export type SortDirection = 'asc' | 'desc'

interface SortControlsProps {
    sortField: SortField
    sortDirection: SortDirection
    onSortChange: (field: 'title' | 'author') => void
}

export const SortControls: React.FC<SortControlsProps> = ({
    sortField,
    sortDirection,
    onSortChange
}) => {
    const renderArrow = (field: SortField) => {
        if (sortField !== field) return ' ↕'
        return sortDirection === 'asc' ? ' ↑' : ' ↓'
    }

    return (
        <div className="sort-selector-container">
            <div className="sort-selector-pills">
                <button
                    onClick={() => onSortChange('title')}
                    className={`sort-btn ${sortField === 'title' ? 'active' : ''}`}
                    title="Ordenar por Título"
                >
                    Título{renderArrow('title')}
                </button>
                <button
                    onClick={() => onSortChange('author')}
                    className={`sort-btn ${sortField === 'author' ? 'active' : ''}`}
                    title="Ordenar por Autor"
                >
                    Autor{renderArrow('author')}
                </button>
            </div>
        </div>
    )
}
