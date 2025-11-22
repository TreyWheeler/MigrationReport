using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ReportMaintenance.Configuration;
using ReportMaintenance.Data;

namespace ReportMaintenance.Services;

public sealed class CategoryCreationService
{
    private static readonly JsonSerializerOptions ReadOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private static readonly JsonSerializerOptions WriteOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly ReportMaintenanceOptions _options;
    private readonly ICategoryKeyProvider _categoryKeyProvider;
    private readonly ILogger<CategoryCreationService> _logger;

    public CategoryCreationService(
        IOptions<ReportMaintenanceOptions> options,
        ICategoryKeyProvider categoryKeyProvider,
        ILogger<CategoryCreationService> logger)
    {
        _options = options.Value;
        _categoryKeyProvider = categoryKeyProvider;
        _logger = logger;
    }

    public async Task<string> CreateCategoryAsync(string name, string? id = null, int? order = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("A category name must be provided.", nameof(name));
        }

        var trimmedName = name.Trim();
        var categoryId = string.IsNullOrWhiteSpace(id) ? CreateSlug(trimmedName) : id!.Trim();

        if (string.IsNullOrWhiteSpace(categoryId))
        {
            throw new InvalidOperationException("Unable to create a category identifier from the provided input.");
        }

        var categoriesDocument = await LoadCategoriesAsync(cancellationToken).ConfigureAwait(false);

        if (categoriesDocument.Categories.Any(c => c.Id.Equals(categoryId, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"Category id '{categoryId}' already exists.");
        }

        if (categoriesDocument.Categories.Any(c => c.Name.Equals(trimmedName, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"Category name '{trimmedName}' already exists.");
        }

        var assignedOrder = order ?? categoriesDocument.Categories.Select(c => c.Order).DefaultIfEmpty(0).Max() + 1;

        if (order is not null)
        {
            foreach (var existing in categoriesDocument.Categories
                .Where(c => c.Order >= assignedOrder)
                .OrderByDescending(c => c.Order))
            {
                existing.Order += 1;
            }
        }

        categoriesDocument.Categories.Add(new Category
        {
            Id = categoryId,
            Name = trimmedName,
            Order = assignedOrder
        });

        categoriesDocument.Categories = categoriesDocument.Categories
            .OrderBy(c => c.Order)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        await PersistCategoriesAsync(categoriesDocument, cancellationToken).ConfigureAwait(false);
        await EnsurePersonWeightsAsync(categoryId, cancellationToken).ConfigureAwait(false);

        _categoryKeyProvider.Invalidate();
        _logger.LogInformation("Created category {CategoryId} ({CategoryName}) at order {Order}.", categoryId, trimmedName, assignedOrder);
        return categoryId;
    }

    private async Task<CategoryDocument> LoadCategoriesAsync(CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.CategoriesPath);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("Categories data not found.", path);
        }

        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<CategoryDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
        if (document is null)
        {
            throw new InvalidOperationException("Unable to deserialize categories data.");
        }

        return document;
    }

    private async Task PersistCategoriesAsync(CategoryDocument document, CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.CategoriesPath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, WriteOptions, cancellationToken).ConfigureAwait(false);
    }

    private async Task EnsurePersonWeightsAsync(string categoryId, CancellationToken cancellationToken)
    {
        var personWeightsDocument = await LoadPersonWeightsAsync(cancellationToken).ConfigureAwait(false);
        var people = await LoadPeopleAsync(cancellationToken).ConfigureAwait(false);

        var existingLookup = new HashSet<string>(
            personWeightsDocument.PersonWeights.Select(entry => BuildCompositeKey(entry.PersonId, entry.CategoryId)),
            StringComparer.OrdinalIgnoreCase);

        var weightAverages = personWeightsDocument.PersonWeights
            .GroupBy(entry => entry.PersonId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.Select(entry => entry.Weight).DefaultIfEmpty(5).Average(),
                StringComparer.OrdinalIgnoreCase);

        var categoriesOrder = (await LoadCategoriesAsync(cancellationToken).ConfigureAwait(false)).Categories
            .OrderBy(c => c.Order)
            .Select((category, index) => new { category.Id, Index = index })
            .ToDictionary(item => item.Id, item => item.Index, StringComparer.OrdinalIgnoreCase);

        foreach (var person in people)
        {
            if (string.IsNullOrWhiteSpace(person.Id))
            {
                continue;
            }

            var key = BuildCompositeKey(person.Id, categoryId);
            if (existingLookup.Contains(key))
            {
                continue;
            }

            var estimate = weightAverages.TryGetValue(person.Id, out var average)
                ? (int)Math.Round(average, MidpointRounding.AwayFromZero)
                : 5;

            estimate = Math.Clamp(estimate, 0, 10);

            personWeightsDocument.PersonWeights.Add(new PersonWeight
            {
                PersonId = person.Id,
                CategoryId = categoryId,
                Weight = estimate
            });

            existingLookup.Add(key);
            _logger.LogInformation("Estimated weight {Weight} for person {PersonId} and category {CategoryId}.", estimate, person.Id, categoryId);
        }

        personWeightsDocument.PersonWeights = personWeightsDocument.PersonWeights
            .OrderBy(entry => entry.PersonId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => categoriesOrder.TryGetValue(entry.CategoryId, out var index) ? index : int.MaxValue)
            .ThenBy(entry => entry.CategoryId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        await PersistPersonWeightsAsync(personWeightsDocument, categoryId, cancellationToken).ConfigureAwait(false);
    }

    private async Task<PersonWeightsDocument> LoadPersonWeightsAsync(CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.PersonWeightsPath);
        if (!File.Exists(path))
        {
            _logger.LogWarning("Person weights file {Path} was not found. A new document will be created.", path);
            return new PersonWeightsDocument();
        }

        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<PersonWeightsDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
        if (document is null)
        {
            throw new InvalidOperationException("Unable to deserialize person weights data.");
        }

        return document;
    }

    private async Task PersistPersonWeightsAsync(PersonWeightsDocument document, string categoryId, CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.PersonWeightsPath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, WriteOptions, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Updated person weights with category {CategoryId}.", categoryId);
    }

    private async Task<IReadOnlyList<Person>> LoadPeopleAsync(CancellationToken cancellationToken)
    {
        var path = ResolvePath(_options.PeoplePath);
        if (!File.Exists(path))
        {
            _logger.LogWarning("People metadata file {Path} was not found. Person identifiers will be inferred from existing weights.", path);
            return await InferPeopleFromPersonWeightsAsync(cancellationToken).ConfigureAwait(false);
        }

        await using var stream = File.OpenRead(path);
        var document = await JsonSerializer.DeserializeAsync<PeopleDocument>(stream, ReadOptions, cancellationToken).ConfigureAwait(false);
        if (document is null)
        {
            throw new InvalidOperationException("Unable to deserialize people data.");
        }

        return document.People
            .Where(person => !string.IsNullOrWhiteSpace(person.Id))
            .ToList();
    }

    private async Task<IReadOnlyList<Person>> InferPeopleFromPersonWeightsAsync(CancellationToken cancellationToken)
    {
        var document = await LoadPersonWeightsAsync(cancellationToken).ConfigureAwait(false);
        return document.PersonWeights
            .Select(entry => entry.PersonId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(id => new Person { Id = id, Name = id })
            .ToList();
    }

    private static string BuildCompositeKey(string personId, string categoryId) =>
        $"{personId}:{categoryId}";

    private string ResolvePath(string relativePath) =>
        Path.GetFullPath(relativePath, Directory.GetCurrentDirectory());

    private static string CreateSlug(string value)
    {
        var trimmed = value.Trim();
        var builder = new StringBuilder(trimmed.Length);
        var lastWasSeparator = true;

        foreach (var ch in trimmed)
        {
            if (char.IsLetterOrDigit(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
                lastWasSeparator = false;
            }
            else if (!lastWasSeparator)
            {
                builder.Append('_');
                lastWasSeparator = true;
            }
        }

        return builder.ToString().Trim('_');
    }
}
